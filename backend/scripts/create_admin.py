"""Create or reset an admin account.

Usage:
    python -m scripts.create_admin --email founder@example.com --name "Founder" [--owner]

The password is read interactively (never pass it on the command line).
"""

import argparse
import getpass
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Admin
from app.models.enums import AdminRole

MIN_PASSWORD_LENGTH = 12


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--owner", action="store_true", help="Grant the OWNER role")
    args = parser.parse_args()

    try:
        email = validate_email(args.email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        print(f"Invalid email address: {exc}", file=sys.stderr)
        return 1

    password = getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(func.lower(Admin.email) == email))
        if admin is None:
            admin = Admin(email=email, name=args.name, password_hash=hash_password(password))
            db.add(admin)
            action = "Created"
        else:
            admin.name = args.name
            admin.password_hash = hash_password(password)
            admin.is_active = True
            action = "Updated"
        admin.role = AdminRole.OWNER if args.owner else AdminRole.ADMIN
        db.commit()
        print(f"{action} admin {admin.email} ({admin.role}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
