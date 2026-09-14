import type { RoleId } from '../engine/roles'
import type { DeathCause } from '../engine/types'

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * The game's name, one brand for both languages. It is the wordmark on the
 * setup screen, the paper's masthead, the TV's title and the share file;
 * the manifest and the page titles carry the same words by hand. The crew
 * is "the Family" / "la Familia" in play, so the title and the game speak
 * with one voice. (Renamed from Omertà on 2026-09-11: user testing found
 * the old name obscure and forgettable.)
 */
export const APP_NAME = 'The Family'

export interface RoleStrings {
  /** Display name, e.g. "El Padrino". */
  name: string
  /**
   * The name as it goes on the card one named person is holding, without the
   * article: "PADRINO", not "EL PADRINO". The article turns a card title into
   * a sentence about its holder, and in Spanish a gendered one — half the
   * table read "EL CIUDADANO" on their own card. The narrator's read-aloud
   * lines keep the article, since they are sentences.
   */
  card: string
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
  /**
   * The citizens' trades, by index — `Player.trade`. The same order in every
   * language, and exactly TRADE_COUNT of them (engine/state.ts). A shop sign,
   * not a description of the person: the word's gender is the word's.
   */
  trades: readonly string[]
  /** The same trades with their article, lower case, for the middle of a sentence. */
  tradesNamed: readonly string[]

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
    /**
     * The paper's breadcrumbs, by kind: a bank per kind, one line picked by
     * night, each taking the trade with its article ("the baker"). `neighbour`
     * says someone from the Family lives next door; `quiet` says nobody does;
     * `doors` gives the distance to where it happened.
     */
    clue: {
      neighbour: readonly ((trade: string) => string)[]
      quiet: readonly ((trade: string) => string)[]
      doors: readonly ((trade: string, doors: number) => string)[]
    }
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
      /** Joining the big screen's room from the names screen (docs/BIG-SCREEN.md §11). */
      screen: string
      screenCode: string
      screenJoin: string
      screenJoining: string
      /** Where the TV goes to start a room; the address is set as a link a TV on the root page can follow. */
      screenHint: (address: string) => string
      screenKeyHint: string
      noSuchScreen: string
      /** The line at the top of the names screen once this phone is a room's narrator. */
      onScreen: (code: string) => string
      /** The address link's title, for a TV that was pointed at the site's root. */
      thisIsScreen: string
      /** Two or more people at the table answer to the same name. */
      sameName: (names: readonly string[]) => string
      /** Asked before a room empties a list of names typed for a phoneless evening. */
      roomTakesNames: string
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
      /** The title after the deal: what the app actually knows. */
      dealt: string
      /** How many of the seats the phone travelled to have held their card. */
      looked: (seen: number, total: number) => string
      /** The tick beside a name that has. */
      seenCard: string
      beginFirstNight: string
      showAgain: string
      doneViewing: string
      pickPlayer: string
      hasQuestion: string
      hasQuestions: string
      /** The flag button's own label once it is on: short, a state not a sentence. */
      questionNoted: string
      questionMarked: string
      /** The private round before night one for players who flagged a question. */
      questionsRound: string
      questionsIntro: string
      showRoleTo: (name: string) => string
      clearFlag: string
      /** The heading over the fuller rules on the held card, for first-timers. */
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
      /** The step's holders all hold phones: the narrator waits, and may still tap for them. */
      onPhones: (names: string[]) => string
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
      /** Asked before the night takes a vote the town has started but not finished. */
      nextNightConfirm: string
      silencedToday: (name: string) => string
      /** The one word button on the day head: replays the reading and lands on the paper. */
      morning: string
      /** The Votes toggle beside the execution question. */
      votes: string
      /** How to record a vote, shown while nobody is armed. */
      voteHint: string
      /** The day head's word button that starts the count on the room's screen. */
      reveal: string
      counting: string
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
      /** The other road from the game-over screen: a different set of people. */
      newTable: string
      newTableConfirm: string
      finishNow: string
      history: string
      /** The banner when the narrator ended it early and nobody won. */
      endedOn: (night: number) => string
    }
    /** The game-over front page, on screen and as the shared image. */
    /** The ledger: the record of finished games, added up. */
    stats: {
      /** The row in ⋯. */
      open: string
      /** The screen's title. */
      title: string
      games: (n: number) => string
      /** …after the count: the date of the earliest game in the record, already formatted. */
      since: (date: string) => string
      /** No game has ended on this phone yet. */
      empty: string
      /** The table's line: wins by side, nights a game, the Detective's hits over looks. */
      table: { town: (n: number) => string; family: (n: number) => string; pair: string; martyr: string; nights: string; looks: string }
      /** The label after each figure on a name's row, by the count, so one game is "1 game". */
      columns: Record<'games' | 'wins' | 'family' | 'hanged' | 'killed' | 'survived', (n: number) => string>
      clear: string
      clearConfirm: string
    }
    paper: {
      title: string
      /** The dateline under the masthead: how many nights, how many at the table. */
      edition: (nights: number, players: number) => string
      /** The same line with the player count dropped, for a narrow phone. */
      editionShort: (nights: number) => string
      whoWasWho: string
      /** The share button while the page is being drawn. */
      drawing: string
      share: string
      /** There was no canvas to draw the page on. */
      cannotShare: string
      /** Over the image shown where the browser has no share sheet for files. */
      holdHint: string
      /** The dateline of a morning edition. */
      daily: (day: number) => string
      /** A side, as the paper names it on an investigation. */
      side: { town: string; crew: string }
      /**
       * The headline over a death, short enough for Bebas in a column; the
       * dek under it is the line the town was read at dawn. A bank per
       * cause, handed out the way the dawn lines are (`deathLines()`), so
       * no two deaths in a game share one and an undo moves nobody's.
       */
      headline: Record<DeathCause, readonly ((name: string) => string)[]>
      /** Headlines over the public events, a bank each picked by night; the dek is the report line. */
      event: {
        silenced: readonly ((name: string) => string)[]
        extraVote: readonly ((name: string) => string)[]
        growl: readonly string[]
        cardTaken: readonly ((role: string) => string)[]
        /** Over a breadcrumb: says only that somebody talked, never who, picked by night. */
        clue: readonly string[]
      }
      /**
       * The investigation: a day after a death the police name what the
       * dead were. A bank per role, four deep, picked by seat and day; the
       * Family's reveals are the town's good news and read so.
       */
      investigation: Record<RoleId, readonly ((name: string) => string)[]>
      /** The dek under an investigation: the card, by its display name. */
      cardOn: (name: string, role: string) => string
      /** …and, for a citizen, the trade the town may now put a name to (`tradesNamed`). */
      tradeLine: (trade: string) => string
      /**
       * Colour, zero to two pieces an edition, seeded by day: council
       * business, the weather, a lost dog. Sixty pieces, so a long game
       * never reads one twice. Never a trade, a person or a role word, so
       * nothing here can be read as a clue (`paper.test.ts` checks the
       * bank against the role names and the trades).
       */
      colour: readonly { headline: string; dek: string }[]
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
      /** The sealed ballot's running count: n of the living have voted. */
      voted: (n: number, living: number) => string
      /** The ballot and the count as the room watches them (docs/DESIGN.md, "The vote"). */
      ballot: string
      count: string
      /** Under the big figure: "4 / 7" have voted; "3 / 7" counted. */
      haveVoted: string
      counted: string
      /** The count is complete: who it points at, or a tie between these names. */
      pointsAt: (name: string) => string
      tie: string
      /** The lobby on the big screen. */
      scanToJoin: string
      joined: (n: number, total: number) => string
      onPhone: string
      proceed: string
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
      /** Another phone claimed this room with the key; this one no longer runs it. */
      replaced: string
      /** The no-TV evening: this phone opens and shows the room. */
      openHere: string
      /** A second screen joins an open room by this address. */
      secondScreen: string
      open: string
      opening: string
      close: string
      code: string
      scan: string
      noTv: string
      tvs: (n: number) => string
      players: (n: number) => string
      /** The TV's address, to type or cast; and the seated names on the sheet. */
      forTv: string
      forPlayers: string
      scanPlayers: string
      openOnTv: string
      nobodyYet: string
      reconnecting: string
      failed: string
    }
    /** A player's own phone. */
    seat: {
      title: string
      yourName: string
      join: string
      /** A phone opened without a room in its address: the code is typed off the screen (docs/BIG-SCREEN.md §11). */
      roomCode: string
      codeHint: string
      /** The room in the address has closed or expired: back to the code. */
      roomGone: string
      joined: (name: string) => string
      waiting: string
      waitingForDeal: string
      /** A seat taken, the table still filling up. */
      atTheTable: string
      /** How many of the table are on their phones. */
      seated: (joined: number, total: number) => string
      /** The narrator's phone has gone quiet mid-game. */
      narratorGone: string
      /** The narrator closed the room. */
      roomEnded: string
      /** The night is over and the narrator is reading it to the room. */
      waking: string
      youAre: (seat: number) => string
      vote: string
      /** Under the label once a vote is cast: how to take it back. */
      yourVote: string
      cannotVote: string
      /** Under the ballot once the vote is cast: the phone is done for now. */
      voted: string
      out: string
      refused: string
      refusedBody: string
      /** The night on a phone (docs/BIG-SCREEN.md §10): the acting seat's chooser. */
      yourMove: string
      familyMark: string
      /** An action went out and the narrator has not answered yet. */
      sent: string
      convertOffer: (name: string) => string
      joinCrew: string
      stayTown: string
      keepCard: string
      bothSpent: string
      /** The Detective's card on his own phone, shown once his step is done. */
      looked: (name: string) => string
      /**
       * The gate pages around the chooser (user, 2026-09-11): the acting phone
       * shows only a sentence and one button before the chooser and after it,
       * so eyes that opened early read no role and no choice off it.
       */
      yourTurn: (name: string) => string
      proceed: string
      closeEyes: (name: string) => string
    }
    /** The TV page, before and between projections. */
    tv: {
      title: string
      noRoom: string
      waiting: string
      reconnecting: string
      /** The screen opened the room itself and no narrator has claimed it yet (docs/BIG-SCREEN.md §11). */
      forNarrator: string
      enterCode: string
      relayDown: string
      /** The wait has gone on long enough to be worth saying out loud. */
      stillTrying: string
      /** The room has a narrator's phone on it, or has lost one. */
      narratorGone: string
      /** The narrator closed the room: the evening is over. */
      ended: string
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
