"""
sample_jobs/monte_carlo_pi.py – Monte Carlo estimation of Pi.
Usage: python3 monte_carlo_pi.py [duration_seconds]
"""
import random
import sys
import time

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    inside = 0
    total = 0
    while time.time() < t_end:
        for _ in range(5000):
            x = random.random()
            y = random.random()
            if x * x + y * y <= 1.0:
                inside += 1
            total += 1
    pi_est = 4.0 * inside / max(1, total)
    print(f"Total samples: {total}, Estimated Pi: {pi_est:.5f}")

if __name__ == "__main__":
    main()
