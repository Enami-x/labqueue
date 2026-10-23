"""
sample_jobs/sleep_io.py – I/O bound simulated worker with sleep intervals.
Usage: python3 sleep_io.py [duration_seconds]
"""
import sys
import time

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    steps = 0
    while time.time() < t_end:
        time.sleep(0.1)
        steps += 1
    print(f"Finished {steps} I/O sleep cycles.")

if __name__ == "__main__":
    main()
