#!/usr/bin/env python3

import subprocess
import time
import sys
import os

CONTAINER_NAME = "auth-test-db"
DB_PORT = "5433"
DB_USER = "auth"
DB_PASS = "test"
DB_NAME = "auth"
LOG_FILE = "test.log"

def run_cmd(cmd, check=True, capture_output=False):
    return subprocess.run(cmd, check=check, capture_output=capture_output, text=True)

def setup_db():
    print(f"Starting test database container '{CONTAINER_NAME}' on port {DB_PORT}...")
    # Remove existing container if it exists
    run_cmd(["docker", "rm", "-f", CONTAINER_NAME], check=False, capture_output=True)

    schema_path = os.path.abspath("db/schema.sql")
    run_cmd([
        "docker", "run", "--name", CONTAINER_NAME,
        "-e", f"POSTGRES_USER={DB_USER}",
        "-e", f"POSTGRES_PASSWORD={DB_PASS}",
        "-e", f"POSTGRES_DB={DB_NAME}",
        "-p", f"{DB_PORT}:5432",
        "-v", f"{schema_path}:/docker-entrypoint-initdb.d/001-schema.sql:ro",
        "-d", "postgres:16-alpine"
    ])

    print("Waiting for database to be ready...")
    for _ in range(30):
        res = run_cmd(["docker", "exec", CONTAINER_NAME, "pg_isready", "-U", DB_USER, "-d", DB_NAME], check=False, capture_output=True)
        if res.returncode == 0:
            print("Database is ready.")
            time.sleep(1) # Give it a moment to finish init scripts
            return
        time.sleep(1)
    
    print("Error: Database failed to become ready.")
    teardown_db()
    sys.exit(1)

def teardown_db():
    print(f"Wiping test database container '{CONTAINER_NAME}'...")
    run_cmd(["docker", "rm", "-f", CONTAINER_NAME], check=False, capture_output=True)

def run_tests():
    print(f"Running tests, output will be saved to {LOG_FILE}...")
    env = os.environ.copy()
    env["DATABASE_URL"] = f"postgres://{DB_USER}:{DB_PASS}@localhost:{DB_PORT}/{DB_NAME}"
    env["REDIS_URL"] = "redis://localhost:6379"

    with open(LOG_FILE, "w") as log:
        process = subprocess.Popen(
            ["npm", "run", "test:run"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        for line in process.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            log.write(line)
            log.flush()

        process.wait()
        return process.returncode

def main():
    try:
        setup_db()
        exit_code = run_tests()
    except Exception as e:
        print(f"An error occurred: {e}")
        exit_code = 1
    finally:
        teardown_db()

    if exit_code == 0:
        print("Tests passed successfully.")
    else:
        print(f"Tests failed with exit code {exit_code}.")
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
