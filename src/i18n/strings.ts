import type { RoleId } from '../engine/roles'
import type { DeathCause } from '../engine/types'

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export interface RoleStrings {
  /** Display name, e.g. "El Padrino". */
  name: string
  /** What the narrator does at this role's step. Third person, to the narrator. */
  prompt: string
  /** What the player reads on their own reveal card. Second person, to them. */
  brief: string
  /**
   * The fuller explanation, for a player who flagged a question: how the role
   * plays out over a game, in second person. Longer than the brief.
   */
  detail: string
}

/**
 * Every user-visible string in the app.
 *
 * Outcome lines are functions rather than templates with placeholders because
 * Spanish and English do not share sentence structure — Spanish needs the verb
 * to agree with a plural subject where English does not, and word order
 * differs. A function per line keeps each language readable on its own terms
 * instead of forcing both through one interpolation shape.
 */
export interface Strings {
  appName: string
  locale: Locale
  /** Endonym, for the language switcher. */
  languageName: string

  roles: Record<RoleId, RoleStrings>

  phase: {
    nightFalls: string
    nightFallsBody: string
    townWakes: string
    townWakesBody: string
    quietNight: string
  }

  outcome: {
    death: (name: string, cause: DeathCause) => string
    silenced: (name: string) => string
    extraVote: (name: string) => string
    growl: () => string
    /** Takes the display name of the role whose card left the centre. */
    cardTaken: (role: string) => string
    /** The day's count, most votes first: name and votes against. */
    tally: (entries: readonly { name: string; votes: number }[]) => string
  }

  winner: {
    town: string
    crew: string
    lovers: string
    martyr: string
  }

  ui: {
    common: {
      next: string
      back: string
      done: string
      cancel: string
      undo: string
      restart: string
      confirm: string
      close: string
    }
    setup: {
      howMany: string
      /** The name-entry screen. */
      whoIsPlaying: string
      addName: string
      addHint: string
      minPlayers: (n: number) => string
      namesReady: (n: number) => string
      clearNames: string
      clearConfirm: string
      remove: string
      players: string
      namePlaceholder: string
      rolePlaceholder: string
      tapToEdit: string
      save: string
      start: string
      incomplete: string
      duplicateRoleHint: string
      dealRandom: string
      complexity: string
      simple: string
      standard: string
      complex: string
      /** Under the complexity: how many of the table will be Family. */
      balance: (crew: number, players: number) => string
      /** …and which way the dealer's table leans, from the simulator. */
      lean: { town: string; even: string; crew: string }
      editRoles: string
      rearrange: string
      rearrangeHint: string
      rearrangeDone: string
      moveLeft: string
      moveRight: string
    }
    reveal: {
      /** Shown while the phone is being handed over — no role information. */
      passTo: (name: string) => string
      areYou: (name: string) => string
      /** Shown beneath the hold button, before anything is revealed. */
      shieldScreen: string
      holdToReveal: string
      keepHolding: string
      yourRole: string
      teamTown: string
      teamCrew: string
      /** Third person, for a card the narrator holds up about someone else. */
      sideTown: string
      sideCrew: string
      released: string
      allSeen: string
      beginFirstNight: string
      showAgain: string
      doneViewing: string
      pickPlayer: string
      hasQuestion: string
      hasQuestions: string
      questionMarked: string
      /** The private round before night one for players who flagged a question. */
      questionsRound: string
      questionsIntro: string
      showRoleTo: (name: string) => string
      clearFlag: string
      /** The heading over the fuller rules on the held card, for first-timers. */
      howItPlays: string
    }
    night: {
      stepCounter: (current: number, total: number) => string
      noOne: string
      heal: string
      poison: string
      pickOne: string
      pickTwo: string
      endNight: string
      wakeGroup: string
      asCircle: string
      asList: string
      /** The Godfather's step: who the Family chose, and the one-time choice. */
      convertOffer: (name: string) => string
      convertNoVictim: string
      convert: string
      convertDecline: string
      /** The Associate's first-night choice of side. */
      joinCrew: string
      stayTown: string
      /** A vial already used, appended to its button. */
      spent: string
      bothSpent: string
      /** Turns the phone to the player at this step. */
      showPlayer: string
      /** The narrator's peek at roles and colours on a night step, and its undo. */
      showRoles: string
      hideRoles: string
      /** The Chameleon's step: the cards left in the centre. */
      spareCards: string
      noSpareCards: string
      keepCard: string
      /** The Cultist's step: the first faction is tapped, the rest is the second. */
      splitHint: string
      splitConfirm: string
    }
    /**
     * The player-facing view of a night step: what the narrator turns the
     * phone around to show. Every line here is read by a player, so it may
     * only say what that player's role already knows.
     */
    view: {
      showingTo: string
      you: string
      doomed: (names: readonly string[]) => string
      doomedNone: string
      victim: (name: string) => string
      crewMarked: string
      cureLeft: string
      cureSpent: string
      poisonLeft: string
      poisonSpent: string
      convertLeft: string
      convertSpent: string
      spare: (roles: readonly string[]) => string
      sectOne: (names: readonly string[]) => string
      sectTwo: (names: readonly string[]) => string
      backToNarrator: string
    }
    day: {
      report: string
      whoDies: string
      nobody: string
      nextNight: string
      silencedToday: (name: string) => string
      /** The Votes toggle beside the execution question. */
      votes: string
      /** How to record a vote, shown while nobody is armed. */
      voteHint: string
      /** A voter is armed: whose pick is awaited. */
      pickFor: (name: string) => string
      /** Accessible name of the count row. */
      tally: string
      /** The Raven's extra vote in the voters list, which has no voter. */
      extraVoteMark: string
    }
    /** The discussion countdown on the day screen; its length is set in ⋯. */
    timer: {
      /** The eyebrow on the clock while it is idle or running. */
      label: string
      paused: string
      timeUp: string
      /** Accessible names of the face (tap to start, tap to pause) and the reset. */
      start: string
      pause: string
      reset: string
      /** A length on the ⋯ row, e.g. "3 min". */
      minutes: (n: number) => string
    }
    /**
     * The dawn slideshow: the night's public outcomes, one full screen each,
     * for the narrator to read aloud or hold up to the table.
     */
    dawn: {
      /** Accessible name of the play button on the day screen. */
      play: string
      /** The counter over the town's verdict, read the way the morning is. */
      verdict: (day: number) => string
      /**
       * A bank of lines per cause of death, ten deep, so that no two people
       * in one game are read the same sentence. Each takes the victim's name
       * and tells its own small story. Newsprint voice: past tense, no
       * exclamation marks, and short enough for one phone screen under a name
       * in Bebas (`dawn.test.ts` holds the limit). The pick is deterministic,
       * so a slide reads the same after an undo or a reload.
       */
      death: Record<DeathCause, readonly ((name: string) => string)[]>
    }
    over: {
      title: string
      playAgain: string
      finishNow: string
      history: string
    }
    /** The game-over front page, on screen and as the shared image. */
    paper: {
      title: string
      /** The dateline under the masthead: how many nights, how many at the table. */
      edition: (nights: number, players: number) => string
      whoWasWho: string
      share: string
      /** There was no canvas to draw the page on. */
      cannotShare: string
      /** Over the image shown where the browser has no share sheet for files. */
      holdHint: string
    }
    /** The overflow sheet behind the ⋯ button in the bottom bar. */
    menu: {
      /** Accessible name of the ⋯ button. */
      more: string
      language: string
      /** Label of the circle/list row; the value is `circle` or `list`. */
      layout: string
      circle: string
      list: string
      restartConfirm: string
      endGameConfirm: string
      /** Shown only while the browser is offering to install the app. */
      install: string
      /** Label of the discussion-timer row; the value is one of TIMER_LENGTHS. */
      timer: string
      /** The mute row: label, and its value either way. */
      sound: string
      on: string
      off: string
      /** The row that turns the screen to the whole room. */
      table: string
      /** The row that opens the room sheet: a code and a QR for a TV. */
      bigScreen: string
    }
    /** The table view: the seating plan for the room, phone on its side. */
    table: {
      day: (n: number) => string
    }
    /** The room sheet on the narrator's phone. */
    room: {
      intro: string
      relay: string
      /** The key the relay wants before it opens a room, and where it comes from. */
      key: string
      keyHint: string
      /** The relay refused the key. */
      refused: string
      open: string
      opening: string
      close: string
      code: string
      scan: string
      noTv: string
      tvs: (n: number) => string
      reconnecting: string
      failed: string
    }
    /** The TV page, before and between projections. */
    tv: {
      title: string
      noRoom: string
      waiting: string
      reconnecting: string
    }
    timeline: {
      title: string
      open: string
      revertHere: string
      nightStart: (n: number) => string
      nightEnd: (n: number) => string
      lynch: (name: string) => string
      hunterShot: (name: string) => string
      skipped: (role: string) => string
      chose: (role: string, name: string) => string
      pairedUp: (role: string, a: string, b: string) => string
      potion: (role: string, name: string, kind: string) => string
      acted: (role: string) => string
      became: (role: string, newRole: string) => string
      /** A vote by day, and one taken back. */
      voted: (voter: string, target: string) => string
      unvoted: (voter: string) => string
    }
  }
}
