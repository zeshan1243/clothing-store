from typing import Any

from sqlalchemy.orm import Session

from app.models import Admin, AdminAuditLog


def record_audit(
    db: Session,
    admin: Admin | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Add an audit entry to the current transaction (committed with the change it describes)."""
    db.add(
        AdminAuditLog(
            admin_id=admin.id if admin else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )
