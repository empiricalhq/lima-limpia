# Citizen app

`apps/citizen` is the public Expo app. It shows active trucks, reports
collection problems, and includes waste-sorting lessons.

## Setup

Install the monorepo dependencies from the repository root:

```sh
bun install
```

Set the API URL in `apps/citizen/.env` or in the environment of the build.
Without it the app calls `https://lima-api.vercel.app`
([`constants.ts`](src/constants.ts)):

```sh
EXPO_PUBLIC_API_URL="http://localhost:4000"
```

When testing on an Android emulator, use `http://10.0.2.2:4000`. On a physical
device, use the development machine's LAN address.

Android maps need a Google Maps API key. Follow
[Expo's Google Cloud API setup guide](https://docs.expo.dev/versions/latest/sdk/maps/#google-cloud-api-setup),
then add the key to `expo.android.config.googleMaps.apiKey` in `app.json`. Keep
the key out of source control.

The app uses native modules, including `expo-maps` and
`react-native-fast-squircle`. Expo Go cannot load this app. Use an EAS
development build or a
[local native build](https://docs.expo.dev/develop/development-builds/introduction/).

## Commands

Run from the repository root:

```sh
bun --filter @lima-garbage/citizens start
bun --filter @lima-garbage/citizens dev
bun --filter @lima-garbage/citizens android
bun --filter @lima-garbage/citizens lint
```

The `lint` script runs Biome. The root `bun run lint` runs Biome and oxlint
together, which adds the React rules Biome does not implement.

The `dev` script uses the `development` EAS profile. Log in first when needed:

```sh
bun --filter @lima-garbage/citizens login
```

## Local Android builds

Install Android Studio and the Android SDK. Set `ANDROID_HOME` to the SDK path
and add its `platform-tools` directory to `PATH`. The app's `mise.toml` pins the
Java version used by the Android build.

After the first native build, Metro hot reload works with the installed
development client.
