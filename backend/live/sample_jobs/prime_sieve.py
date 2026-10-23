"""
sample_jobs/prime_sieve.py – Sieve of Eratosthenes calculation for duration seconds.
Usage: python3 prime_sieve.py [duration_seconds]
"""
import sys
import time

def sieve(n=100000):
    flags = [True] * (n + 1)
    flags[0] = flags[1] = False
    for i in range(2, int(n ** 0.5) + 1):
        if flags[i]:
            for j in range(i * i, n + 1, i):
                flags[j] = False
    return sum(flags)

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    total = 0
    while time.time() < t_end:
        total += sieve(50000)
    print(f"Computed primes, iterations total: {total}")

if __name__ == "__main__":
    main()
