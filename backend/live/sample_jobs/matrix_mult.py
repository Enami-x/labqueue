"""
sample_jobs/matrix_mult.py – Matrix multiplication benchmark.
Usage: python3 matrix_mult.py [duration_seconds]
"""
import sys
import time
import random

def main():
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    t_end = time.time() + duration
    N = 60
    while time.time() < t_end:
        A = [[random.random() for _ in range(N)] for _ in range(N)]
        B = [[random.random() for _ in range(N)] for _ in range(N)]
        C = [[sum(A[i][k] * B[k][j] for k in range(N)) for j in range(N)] for i in range(N)]

if __name__ == "__main__":
    main()
