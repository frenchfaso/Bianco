import getpass
import sys

from pwdlib import PasswordHash


def main() -> int:
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1
    if len(password) < 12:
        print("Use at least 12 characters.", file=sys.stderr)
        return 1
    print(PasswordHash.recommended().hash(password))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
