# FLOWORK SENTINEL TRIGGER SPECIFICATION

## Trigger Identification
- **ID**: `trigger-flowork-sentinel`
- **Channel**: `/api/sentinel/trigger`
- **Category**: `Automation & External Web Ingress`

## Trigger Events
- `sentinel_session_completed`: Dispatched when a user stops an external recording session.
- `sentinel_skill_synthesized`: Dispatched when cognitive synthesis generates a new `SKILL.md`.
- `sentinel_skill_deployed`: Dispatched when the skill is deployed into `skills/`.
