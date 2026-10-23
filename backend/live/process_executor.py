"""
backend/live/process_executor.py – Safe process lifecycle management using psutil.

Handles spawning, preemption (suspend/resume via OS signals), resource monitoring,
and termination of real child processes for the LabQueue Live Mode.
"""

from __future__ import annotations

import os
import sys
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
import psutil

SAMPLE_JOBS_DIR = Path(__file__).parent / "sample_jobs"

DEFAULT_SCRIPTS = {
    "cpu_burn": "cpu_burn.py",
    "matrix_mult": "matrix_mult.py",
    "prime_sieve": "prime_sieve.py",
    "hash_files": "hash_files.py",
    "monte_carlo_pi": "monte_carlo_pi.py",
    "sleep_io": "sleep_io.py",
}


@dataclass
class ProcessInfo:
    job_id: str
    pid: int
    script_name: str
    duration: float
    popen: subprocess.Popen
    psutil_proc: psutil.Process
    is_suspended: bool = False
    returncode: Optional[int] = None


class ProcessExecutor:
    """
    Manages active subprocesses for live execution.
    Preemption is performed using psutil.Process.suspend() and resume().
    """

    def __init__(self, jobs_dir: Optional[Path] = None):
        self.jobs_dir = jobs_dir or SAMPLE_JOBS_DIR
        self._processes: Dict[str, ProcessInfo] = {}

    def _resolve_script(self, script_name: str) -> Path:
        """Resolve script name to an absolute file path safely."""
        name = script_name.strip()
        if not name.endswith(".py"):
            name = DEFAULT_SCRIPTS.get(name, f"{name}.py")
        
        path = (self.jobs_dir / name).resolve()
        # Security check: ensure path is within jobs_dir
        if not path.is_file() or not str(path).startswith(str(self.jobs_dir.resolve())):
            # Fallback to cpu_burn.py
            path = (self.jobs_dir / "cpu_burn.py").resolve()
        return path

    def spawn(
        self,
        job_id: str,
        script_name: str = "cpu_burn.py",
        duration: float = 5.0,
        extra_args: Optional[List[str]] = None,
    ) -> ProcessInfo:
        """
        Spawn a new job subprocess without shell=True.
        """
        if job_id in self._processes:
            info = self._processes[job_id]
            if info.popen.poll() is None:
                raise RuntimeError(f"Job {job_id} already has a running process with pid {info.pid}")

        script_path = self._resolve_script(script_name)
        cmd = [sys.executable, str(script_path), str(duration)]
        if extra_args:
            cmd.extend(extra_args)

        popen = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        psutil_proc = psutil.Process(popen.pid)

        info = ProcessInfo(
            job_id=job_id,
            pid=popen.pid,
            script_name=script_path.name,
            duration=duration,
            popen=popen,
            psutil_proc=psutil_proc,
            is_suspended=False,
            returncode=None,
        )
        self._processes[job_id] = info
        return info

    def suspend(self, job_id: str) -> bool:
        """Preempt / suspend a process using SIGSTOP."""
        info = self._processes.get(job_id)
        if not info or info.is_suspended:
            return False
        try:
            if info.popen.poll() is None and info.psutil_proc.is_running():
                info.psutil_proc.suspend()
                info.is_suspended = True
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        return False

    def resume(self, job_id: str) -> bool:
        """Resume a suspended process using SIGCONT."""
        info = self._processes.get(job_id)
        if not info or not info.is_suspended:
            return False
        try:
            if info.psutil_proc.is_running():
                info.psutil_proc.resume()
                info.is_suspended = False
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        return False

    def kill(self, job_id: str) -> bool:
        """Terminate and clean up a process."""
        info = self._processes.get(job_id)
        if not info:
            return False
        try:
            if info.is_suspended:
                # Must resume before killing on some Unix kernels to process signal
                try:
                    info.psutil_proc.resume()
                except Exception:
                    pass
            if info.psutil_proc.is_running():
                info.psutil_proc.kill()
                info.psutil_proc.wait(timeout=1.0)
        except (psutil.NoSuchProcess, psutil.TimeoutExpired, psutil.AccessDenied):
            try:
                info.popen.kill()
            except Exception:
                pass
        finally:
            info.returncode = info.popen.poll() or -9
        return True

    def poll(self, job_id: str) -> Optional[int]:
        """Check if process has terminated; return exit code or None if running."""
        info = self._processes.get(job_id)
        if not info:
            return None
        if info.returncode is not None:
            return info.returncode

        rc = info.popen.poll()
        if rc is not None:
            info.returncode = rc
            return rc
        return None

    def get_metrics(self, job_id: str) -> Dict[str, any]:
        """Fetch current process stats."""
        info = self._processes.get(job_id)
        if not info:
            return {"status": "none", "cpu_percent": 0.0, "memory_rss_mb": 0.0}

        rc = self.poll(job_id)
        if rc is not None:
            return {
                "status": "completed" if rc == 0 else "failed",
                "cpu_percent": 0.0,
                "memory_rss_mb": 0.0,
                "exit_code": rc,
            }

        if info.is_suspended:
            return {
                "status": "suspended",
                "cpu_percent": 0.0,
                "memory_rss_mb": 0.0,
            }

        try:
            with info.psutil_proc.oneshot():
                cpu = info.psutil_proc.cpu_percent(interval=None)
                mem = info.psutil_proc.memory_info().rss / (1024 * 1024)
                return {
                    "status": "running",
                    "cpu_percent": round(cpu, 1),
                    "memory_rss_mb": round(mem, 2),
                }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return {"status": "terminated", "cpu_percent": 0.0, "memory_rss_mb": 0.0}

    def cleanup_all(self):
        """Clean up all processes managed by this executor."""
        for jid in list(self._processes.keys()):
            self.kill(jid)
        self._processes.clear()
