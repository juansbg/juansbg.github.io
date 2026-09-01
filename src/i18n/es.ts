import type { Strings } from './strings'

export const es: Strings = {
  appName: 'Omertà',
  locale: 'es',
  languageName: 'Español',

  roles: {
    // ---- La familia ----
    KILLER: { name: 'La Familia', prompt: 'Eligen a su víctima.' },
    CONVERT: {
      name: 'El Padrino',
      prompt: 'Decide si hace suyo al elegido en vez de matarlo. Una sola vez.',
    },
    ROGUE: { name: 'El Renegado', prompt: 'Elige otra víctima, incluso de los suyos.' },
    PICK_SIDE: { name: 'El Aspirante', prompt: 'Decide de qué lado está.' },

    // ---- El pueblo ----
    PLAIN: { name: 'El Ciudadano', prompt: 'Duerme.' },
    INSPECT: { name: 'El Detective', prompt: 'Señala a alguien: enséñale su carta.' },
    GUARD: {
      name: 'El Guardaespaldas',
      prompt: 'Elige a quién proteger. Puede ser él mismo, pero nunca el mismo dos noches seguidas.',
    },
    MEDIC: {
      name: 'La Santera',
      prompt: 'Dile quién va a morir. Decide si usa el remedio o el veneno.',
    },
    SURVIVE: { name: 'El Veterano', prompt: 'Sobrevive al primer atentado contra su vida.' },
    SILENCE: { name: 'El Incendiario', prompt: 'Quema una casa: mañana no podrá hablar ni votar.' },
    EXTRA_VOTE: { name: 'El Soplón', prompt: 'Señala a alguien: mañana tendrá un voto más en contra.' },
    PAIR: { name: 'El Amarre', prompt: 'Ata a dos personas. Si una cae, la otra la sigue.' },
    PROTEGE: { name: 'El Huérfano', prompt: 'Elige a su padrino. Si lo matan, se une a la Familia.' },
    SENSE: { name: 'El Sabueso', prompt: 'Gruñe si tiene un asesino al lado.' },
    AVENGE: { name: 'El Pistolero', prompt: 'Al morir se lleva a alguien por delante.' },
    MARTYR: { name: 'El Mártir', prompt: 'Gana si el pueblo lo ejecuta.' },
    SWAP: { name: 'El Camaleón', prompt: 'Toma una carta del centro y cambia de papel.' },
    PEEK: { name: 'El Testigo', prompt: 'Abre los ojos mientras la Familia actúa.' },
    SPLIT: { name: 'El Sectario', prompt: 'Divide al pueblo en dos bandos.' },
  },

  phase: {
    nightFalls: 'La ciudad duerme',
    nightFallsBody: 'Que todos cierren los ojos.',
    townWakes: '¡La ciudad despierta!',
    townWakesBody: 'El pueblo discute lo ocurrido esta noche.',
    quietNight: 'La noche ha pasado sin novedad.',
  },

  outcome: {
    death: (name, cause) => {
      switch (cause) {
        case 'killers':
          return `Ha amanecido muerto ${name}.`
        case 'rogue':
          return `También ha muerto ${name}.`
        case 'poison':
          return `${name} ha muerto envenenado.`
        case 'lynch':
          return `El pueblo ha ejecutado a ${name}.`
        case 'heartbreak':
          return `${name} no ha soportado la pérdida y se ha ido con su amarre.`
        case 'revenge':
          return `${name} ha caído por el último disparo del Pistolero.`
      }
    },
    silenced: (name) => `Han quemado la casa de ${name}: hoy no puede hablar ni votar.`,
    extraVote: (name) => `${name} carga hoy con un voto más en su contra.`,
    growl: () => 'El sabueso ha gruñido esta noche.',
  },

  winner: {
    town: 'Gana el pueblo.',
    crew: 'Gana la Familia.',
    lovers: 'Ganan los amarrados.',
  },
}
