# Live Observation Traffic Particle Size Design

## Goal

Make each received-traffic particle clearly visible on a presentation screen without covering resource nodes or changing the observation data flow.

## Approved Design

- Increase the circular traffic particle from 10px to 16px.
- Keep a 3px blue border and use a 6px translucent outer glow.
- Keep the particle centered on the connector by moving its vertical offset to half of its size.
- Start the particle fully before the connector and stop it at the connector endpoint so it never travels past the next resource.
- Render particles only for a bounded accepted-event burst after Live Observation has started. Static connectors remain still before traffic is received.
- Preserve reduced-motion behavior and the existing maximum visible particle count.

## Verification

- Update the Live Observation presentation contract test to require a 16px circular particle and matching endpoint bounds.
- Run the focused Live Observation tests.
- Run repository lint, typecheck, build, and harness checks.

## Scope

This change affects only traffic-particle presentation. It does not change event polling, accepted-event counting, capacity calculation, or scale-out behavior.
