import asyncio
from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal, get_engine
from app.db.base import Base
from app import models  # IMPORTANT: registers models

from app.models.user import User, UserRole
from app.core.security import hash_password


# ----------------------------
# CONFIG: BOOTSTRAP ADMIN
# ----------------------------
ADMIN_EMAIL = "admin@platform.com"
ADMIN_PASSWORD = "admin123"


async def create_tables():
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Keep older local databases in sync when new columns are introduced.
        await conn.execute(
            text(
                "ALTER TABLE videos "
                "ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) "
                "NOT NULL DEFAULT 'PUBLIC'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE videos "
                "ADD COLUMN IF NOT EXISTS thumbnail_key VARCHAR(512)"
            )
        )
        await conn.execute(
            text("UPDATE videos SET visibility = 'PUBLIC' WHERE visibility IS NULL")
        )
        await conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS is_active BOOLEAN "
                "NOT NULL DEFAULT TRUE"
            )
        )
        await conn.execute(
            text("UPDATE users SET is_active = TRUE WHERE is_active IS NULL")
        )
        await conn.execute(
            text(
                "ALTER TABLE live_sessions "
                "ADD COLUMN IF NOT EXISTS description VARCHAR(2000) "
                "NOT NULL DEFAULT ''"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE live_sessions "
                "ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN "
                "NOT NULL DEFAULT FALSE"
            )
        )
        await conn.execute(
            text("UPDATE live_sessions SET description = '' WHERE description IS NULL")
        )
        await conn.execute(
            text(
                "UPDATE live_sessions "
                "SET recording_enabled = FALSE "
                "WHERE recording_enabled IS NULL"
            )
        )


async def create_bootstrap_admin():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == ADMIN_EMAIL)
        )
        admin = result.scalar_one_or_none()

        if admin:
            print("✅ Bootstrap admin already exists")
            return

        admin = User(
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            role=UserRole.ADMIN,
        )
        db.add(admin)
        await db.commit()

        print("🚀 Bootstrap admin created")


async def init_db():
    await create_tables()
    await create_bootstrap_admin()


if __name__ == "__main__":
    asyncio.run(init_db())
