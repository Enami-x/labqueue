"""
sample_jobs/cpu_burn.py – Burn CPU cycles for approximately `duration` seconds.
Usage: python3 cpu_burn.py [duration_seconds]
"""
import sys
import time

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    x = 0
    while time.time() < t_end:
        x = (x * 3 + 1) % 1000000007

if __name__ == "__main__":
    main()
