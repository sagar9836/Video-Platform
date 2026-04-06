import asyncio
from sqlalchemy import select

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
