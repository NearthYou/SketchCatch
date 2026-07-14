# Live Observation Single Traffic Particle Design

## Goal

Represent each accepted traffic request as one large, readable circle that moves through the analyzed diagram path without being duplicated across connector segments.

## Approved Presentation

- Render each traffic particle at exactly 28px.
- Keep a 3px blue border and increase the translucent outer glow to 8px.
- One accepted request creates one logical particle.
- A logical particle appears on only one connector segment at a time.
- When a segment animation ends, the same logical particle hands off to the next connector segment.
- Multiple accepted requests may be visible concurrently, but the number of logical particles never exceeds the bounded request burst count.
- Keep resource-node pulses as arrival feedback; they do not count as additional traffic particles.

## Timing Model

- Each connector segment receives a dedicated time window inside one end-to-end request animation.
- Segment windows do not overlap for the same logical request.
- Separate requests start with a short stagger so concurrent traffic remains readable.
- Burst cleanup includes every segment window and the final request stagger, preventing a particle from disappearing before it reaches the capacity controller.

## Data Flow

The existing accepted-event delta remains the source of truth. `LiveObservationModal` creates a bounded burst, `LiveObservationDiagramMap` maps each logical request across sequential segment windows, and the existing snapshot path continues to control pressure and capacity state.

## Accessibility And Safety

- Reduced-motion mode continues to suppress moving circles.
- Particles remain decorative and `aria-hidden`.
- Observation start, traffic generation, polling, capacity calculations, and AWS behavior remain unchanged.

## Verification

- Add pure timing tests proving that segment windows for one request never overlap.
- Add presentation tests requiring 28px geometry and one logical particle per accepted request.
- Verify burst lifetime covers the final segment of the final logical request.
- Run focused Live Observation tests, repository gates, and an authenticated browser check with a short traffic burst.

## Scope

This change affects only traffic-particle sizing and sequencing. It does not change the accepted-event count, traffic boost rate, observation transport, scale-out thresholds, or capacity rendering.
