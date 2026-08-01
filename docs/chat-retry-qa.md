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

## Realtime expectation

Cross-browser testing depends on the same Supabase project and confirmed users.

When user A sends to user B:

- User A should see the outgoing bubble immediately.
- User B should see the incoming bubble after realtime delivery or a refresh.
- If realtime is delayed, refreshing `/chats` and reopening the thread should still show the saved message.

## Supabase dependency

The reaction fix assumes the backend exposes the message reaction write path used by the current chat data source.

If reactions fail in a deployed environment, check:

- The user is signed in with a real Supabase Auth account.
- The conversation membership row exists for both participants.
- Row-level security allows the current user to update their reaction on visible messages.

## Manual QA users

Use the project test accounts in separate browser profiles or a normal window plus an incognito window.

Recommended checks:

- Naveen to Yogesh
- Yogesh to Naveen
- Naveen to Kavya
- Kavya to Naveen

Each pair should be tested with one sent message and one reaction.

## Known non-goals

This retry pass does not redesign the entire chat surface.

Not included here:

- Full business chat implementation
- Payment flow behavior from the chat composer
- Audio recording upload pipeline
- Push notification delivery

## Validation

Commands used for this retry pass:

```sh
npx tsc --noEmit
git diff --check
```

Both commands should remain clean before pushing further chat changes.

## Smoke test steps

1. Sign in as Naveen.
2. Open Chats and confirm the list renders without the nested button warning.
3. Open an accepted conversation.
4. Send a short text message.
5. Add a reaction to the newest message.
6. Sign in as the second user and confirm the message and reaction are visible.
