"""
Pydantic Schemas for TradingAgents Sovereign Council
===================================================
Typed structured output schemas ported directly from Tauric Research's
TradingAgents framework to guarantee schema conformity and input sanitization.

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

from __future__ import annotations
import re
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator

_NULLISH_FLOAT = {"", "none", "n/a", "na", "null", "nil", "-", "tbd", "unknown"}


def coerce_optional_float(value) -> Optional[float]:
    """Sanitize and coerce optional float inputs from LLM responses."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _NULLISH_FLOAT or text.endswith("%"):
            return None
        cleaned = re.sub(r"[^\d.-]", "", text)
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


class PortfolioRating(str, Enum):
    """5-tier rating scale used by Research Manager and Portfolio Manager."""
    BUY = "Buy"
    OVERWEIGHT = "Overweight"
    HOLD = "Hold"
    UNDERWEIGHT = "Underweight"
    SELL = "Sell"


class TraderAction(str, Enum):
    """3-tier transaction action used by the Trader."""
    BUY = "Buy"
    HOLD = "Hold"
    SELL = "Sell"


class ResearchPlan(BaseModel):
    """Structured investment plan produced by Research Manager."""
    recommendation: PortfolioRating = Field(
        description="The investment recommendation. Exactly one of: Buy / Overweight / Hold / Underweight / Sell."
    )
    rationale: str = Field(
        description="Conversational synthesis of the bull vs bear debate and key deciding factors."
    )
    strategic_actions: str = Field(
        description="Concrete strategic guidance for the execution trader."
    )


class TraderProposal(BaseModel):
    """Structured tactical order proposal produced by Trader."""
    action: TraderAction = Field(
        description="Action direction: Buy, Hold, or Sell."
    )
    reasoning: str = Field(
        description="Technical and tactical justification anchored in market indicators and research plan."
    )
    entry_price: Optional[float] = Field(
        default=None,
        description="Entry price target as an absolute number in quote currency."
    )
    stop_loss: Optional[float] = Field(
        default=None,
        description="Stop-loss price level as an absolute number."
    )
    take_profit: Optional[float] = Field(
        default=None,
        description="Target profit price level as an absolute number."
    )
    position_sizing: Optional[str] = Field(
        default=None,
        description="Position sizing guidance (e.g. '50 units (~$10,000, 2% risk)')."
    )

    @field_validator("entry_price", "stop_loss", "take_profit", mode="before")
    @classmethod
    def validate_floats(cls, v):
        return coerce_optional_float(v)


class PortfolioDecision(BaseModel):
    """Final executive decision produced by Portfolio Manager."""
    rating: PortfolioRating = Field(
        description="Final position rating: Buy, Overweight, Hold, Underweight, or Sell."
    )
    executive_summary: str = Field(
        description="Concise 2 to 4 sentence action plan covering entry strategy, risk levels, and horizon."
    )
    investment_thesis: str = Field(
        description="Detailed thesis anchored in specific evidence from the multi-agent debate and past trade lessons."
    )
    price_target: Optional[float] = Field(
        default=None,
        description="Target price in instrument's quote currency."
    )
    stop_loss: Optional[float] = Field(
        default=None,
        description="Stop-loss level in instrument's quote currency."
    )
    time_horizon: Optional[str] = Field(
        default="3-10 Trading Sessions",
        description="Recommended holding horizon."
    )

    @field_validator("price_target", "stop_loss", mode="before")
    @classmethod
    def validate_floats(cls, v):
        return coerce_optional_float(v)
