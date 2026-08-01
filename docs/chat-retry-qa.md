# Chat retry QA handoff

This note tracks the chat retry pass that fixed the reaction controls and the web clickability issue around nested press targets.

Scope covered:

- Personal chat detail screen
- Message reaction picker
- Web-safe touch targets
- Supabase-backed message reaction persistence

## What changed

- Message reactions now save through the active chat data source instead of staying only in local UI state.
- The same emoji can be tapped again to remove a reaction.
- Failed reaction writes show a visible error instead of silently doing nothing.
- Each message bubble has an explicit reaction trigger, so testers do not need to depend on long-press behavior.
