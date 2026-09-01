import type { Strings } from './strings'

export const en: Strings = {
  appName: 'Omertà',
  locale: 'en',
  languageName: 'English',

  roles: {
    // ---- The Family ----
    KILLER: { name: 'The Family', prompt: 'They choose their victim.' },
    CONVERT: {
      name: 'The Godfather',
      prompt: 'Decides whether to make the victim one of his own instead of killing them. Once only.',
    },
    ROGUE: { name: 'The Renegade', prompt: 'Picks another victim — his own side included.' },
    PICK_SIDE: { name: 'The Associate', prompt: 'Decides which side he is on.' },

    // ---- The town ----
    PLAIN: { name: 'The Citizen', prompt: 'Sleeps.' },
    INSPECT: { name: 'The Detective', prompt: 'Points at someone — show them that card.' },
    GUARD: {
      name: 'The Bodyguard',
      prompt: 'Chooses who to protect. May pick himself, but never the same person two nights running.',
    },
    MEDIC: {
      name: 'The Santera',
      prompt: 'Tell her who is about to die. She decides whether to spend the cure or the poison.',
    },
    SURVIVE: { name: 'The Veteran', prompt: 'Survives the first attempt on his life.' },
    SILENCE: { name: 'The Arsonist', prompt: 'Burns a house down — tomorrow they cannot speak or vote.' },
    EXTRA_VOTE: { name: 'The Snitch', prompt: 'Points at someone — tomorrow they carry an extra vote against them.' },
    PAIR: { name: 'The Binding', prompt: 'Ties two people together. If one falls, the other follows.' },
    PROTEGE: { name: 'The Orphan', prompt: 'Chooses a mentor. If the mentor is killed, he joins the Family.' },
    SENSE: { name: 'The Bloodhound', prompt: 'Growls when a killer is sitting beside him.' },
    AVENGE: { name: 'The Gunman', prompt: 'Takes someone with him when he dies.' },
    MARTYR: { name: 'The Martyr', prompt: 'Wins if the town executes him.' },
    SWAP: { name: 'The Chameleon', prompt: 'Takes a spare card from the centre and changes role.' },
    PEEK: { name: 'The Witness', prompt: 'Opens their eyes while the Family is awake.' },
    SPLIT: { name: 'The Cultist', prompt: 'Splits the town into two factions.' },
  },

  phase: {
    nightFalls: 'The city sleeps',
    nightFallsBody: 'Everyone close your eyes.',
    townWakes: 'The city wakes!',
    townWakesBody: 'The town talks over what happened in the night.',
    quietNight: 'The night passed without incident.',
  },

  outcome: {
    death: (name, cause) => {
      switch (cause) {
        case 'killers':
          return `${name} was found dead this morning.`
        case 'rogue':
          return `${name} is dead too.`
        case 'poison':
          return `${name} was poisoned.`
        case 'lynch':
          return `The town executed ${name}.`
        case 'heartbreak':
          return `${name} could not bear the loss and followed their binding.`
        case 'revenge':
          return `${name} fell to the Gunman's last shot.`
      }
    },
    silenced: (name) => `${name}'s house was burned down — today they cannot speak or vote.`,
    extraVote: (name) => `${name} carries an extra vote against them today.`,
    growl: () => 'The bloodhound growled in the night.',
  },

  winner: {
    town: 'The town wins.',
    crew: 'The Family wins.',
    lovers: 'The bound pair win together.',
  },

  ui: {
    common: {
      next: 'Next',
      back: 'Back',
      done: 'Done',
      cancel: 'Cancel',
      undo: 'Undo',
      restart: 'Restart',
      confirm: 'Confirm',
      close: 'Close',
    },
    setup: {
      howMany: 'How many players?',
      players: 'Players',
      namePlaceholder: 'Name',
      rolePlaceholder: 'Pick a role',
      tapToEdit: 'Tap a player to edit them',
      save: 'Save',
      start: 'Deal the roles',
      incomplete: 'Some players still need a role',
      duplicateRoleHint: 'Repeating roles and names is fine',
    },
    reveal: {
      passTo: (name) => `Pass the phone to ${name}`,
      areYou: (name) => `Are you ${name}?`,
      shieldScreen: 'Make sure nobody else can see the screen.',
      holdToReveal: 'Press and hold to see your role',
      keepHolding: 'Keep holding',
      yourRole: 'Your role',
      teamTown: 'You are with the town',
      teamCrew: 'You are with the Family',
      released: 'Hidden. Hand the phone back.',
      allSeen: 'Everyone has seen their role',
      beginFirstNight: 'Begin the first night',
      showAgain: 'Show a role again',
      pickPlayer: 'Who needs to see it?',
    },
    night: {
      stepCounter: (current, total) => `${current} of ${total}`,
      noOne: 'No one',
      heal: 'Heal',
      poison: 'Poison',
      pickOne: 'Choose who',
      pickTwo: 'Choose two',
      endNight: 'End the night',
      wakeGroup: 'Wake them together.',
    },
    day: {
      report: 'What happened in the night',
      whoDies: 'Who does the town execute?',
      nobody: 'Nobody dies today',
      nextNight: 'Night falls',
      silencedToday: (name) => `${name} cannot speak or vote today`,
    },
    over: {
      title: 'Game over',
      playAgain: 'Play again',
    },
  },
}
