from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class NetworkPlan(Base):
    __tablename__ = "network_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), default="Home LAN")
    cidr: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    slots: Mapped[list["PlanSlot"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanSlot.sort_order"
    )


class PlanSlot(Base):
    __tablename__ = "plan_slots"
    __table_args__ = (
        UniqueConstraint("plan_id", "planned_ip", name="uq_plan_slot_ip"),
        UniqueConstraint("plan_id", "device_mac", name="uq_plan_slot_mac"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("network_plans.id", ondelete="CASCADE"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    planned_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    hostname_hint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    device_mac: Mapped[str | None] = mapped_column(String(17), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped["NetworkPlan"] = relationship(back_populates="slots")
    ports: Mapped[list["PlanPort"]] = relationship(
        back_populates="slot", cascade="all, delete-orphan", order_by="PlanPort.sort_order"
    )


class PlanPort(Base):
    __tablename__ = "plan_ports"
    __table_args__ = (UniqueConstraint("slot_id", "port", name="uq_plan_port"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("plan_slots.id", ondelete="CASCADE"))
    port: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(128), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    slot: Mapped["PlanSlot"] = relationship(back_populates="ports")
