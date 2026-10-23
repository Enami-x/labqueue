"""
sample_jobs/hash_files.py – Cryptographic hash computation simulating I/O & CPU data processing.
Usage: python3 hash_files.py [duration_seconds]
"""
import hashlib
import os
import sys
import time

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    data = os.urandom(64 * 1024)  # 64 KB block
    h = hashlib.sha256()
    rounds = 0
    while time.time() < t_end:
        for _ in range(50):
            h.update(data)
        rounds += 1
        time.sleep(0.005)  # slight I/O pacing
    print(f"Hashed {rounds} rounds: {h.hexdigest()[:16]}")

if __name__ == "__main__":
    main()
