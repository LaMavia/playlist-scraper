import dotenv from 'dotenv'

const DEFAULT_ENV = {
  BUTTON_FAIL: 15000,
  GOTO: 5000,
  REPEAT: false,
  SLOW_CRASH: 5000,
} as { [key: string]: any }

export const load_env = () => {
  dotenv.config()

  // -------- Replace the missing env vars with the default ones -------- //

  for (const key in DEFAULT_ENV) {
    // @ts-ignore
    if (typeof process.env[key] == 'undefined')
      process.env[key] = DEFAULT_ENV[key]
    else
      switch (typeof DEFAULT_ENV[key]) {
        case 'number':
          // @ts-ignore
          process.env[key] = Number(process.env[key])
          break
        case 'boolean':
          // @ts-ignore
          process.env[key] = Boolean(process.env[key])
          break
      }

    console.log(`${key} = ${process.env[key]} [${typeof process.env[key]}]`)
  }
}

export const bool = (key: string) =>
  ['t', 'T', '1', 'true', 'True', 'Yes', 'y', 'yep', 'si'].includes(
    process.env[key] || DEFAULT_ENV[key]
  )

export const num = (key: string) => +(process.env[key] || DEFAULT_ENV[key])
