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

## Reaction picker checks

Use any accepted one-to-one chat and tap the small reaction control beside a message bubble.

Expected behavior:

- Picker opens with the six standard emoji options.
- Selecting an emoji closes the picker after the save finishes.
- The selected reaction remains visible after leaving and reopening the chat.
- Retapping the same emoji removes the reaction.

## Web nested button check

React Native Web was warning that a button cannot contain another button. The chat retry pass keeps outer rows pressable while moving inner actions into sibling press targets.

Areas covered:

- Conversation rows and their menu buttons
- Chat message bubbles and reaction controls
- Sticker picker rows
- Bottom-sheet dismiss overlays

## Composer guard

The send button should only be active when the composer has text and the conversation is allowed to send.

Manual check:

1. Open an accepted chat.
2. Type a short message.
3. Confirm the paper-plane button becomes active.
4. Send the message and confirm the composer clears after the row appears.

## Request acceptance path

For pending message requests, accept should be treated as a single in-flight action.

Expected behavior:

- Button disables while the acceptance request is saving.
- A repeated click should not create duplicate rows.
- After acceptance, both users can open the same conversation thread.
