import { createMachine, assign } from 'xstate';
import type { DraftFlowContext } from '../lib/draft.schemas';

// FLOW machine only: who's on the block, at what price, what's being dragged.
// All draft DATA (players, picks, budgets, watchlist) lives in Dexie
// (lib/db.ts), is read via useDraftData, and is mutated via lib/mutations.ts.

const initialFlowContext: DraftFlowContext = {
    nominatedPlayer: {},
    nominationPrice: 0,
    draggedPlayer: {},
    budgetSlotTargeted: {},
};

const clearNomination = {
    nominatedPlayer: () => ({}),
    nominationPrice: () => 0,
};

export const draftStateMachine = createMachine({
  context: initialFlowContext,
  initial: 'waiting',
  states: {
    waiting: {
        on: {
            'nominate_player': {
                actions: assign({
                    nominatedPlayer: ({ event }) => event.player,
                    nominationPrice: ({ event }) => Math.round(parseFloat(event.player.projected_price)) || 1,
                }),
                target: 'player_nominated',
            },
            'drag_player': {
                actions: assign({
                    draggedPlayer: ({ event }) => event.player,
                }),
            },
            'budget_slot_targeted': {
                actions: assign({
                    budgetSlotTargeted: ({ event }) => event.positionSlot,
                }),
            },
        },
    },
    player_nominated: {
        on: {
            'set_nomination_price': {
                actions: assign({
                    nominationPrice: ({ event }) => event.price,
                }),
            },
            // The nominated player was drafted (data side already handled by
            // mutations.submitPick) — clear the block.
            'draft_player': {
                actions: assign(clearNomination),
                target: 'waiting',
            },
            'cancel_nomination': {
                actions: assign(clearNomination),
                target: 'waiting',
            },
            'drag_player': {
                actions: assign({
                    draggedPlayer: ({ event }) => event.player,
                }),
            },
            'budget_slot_targeted': {
                actions: assign({
                    budgetSlotTargeted: ({ event }) => event.positionSlot,
                }),
            },
        },
    },
  },
  on: {
    // Switching to a different draft: abandon all in-flight interaction state.
    'reset_flow': {
        actions: assign(() => ({ ...initialFlowContext })),
        target: '.waiting',
    },
  },
});
