const version = process.env.NEXT_PUBLIC_APP_VERSION;

if (!version) {
  throw new Error("NEXT_PUBLIC_APP_VERSION must be injected from the root package.json");
}

export const APP_VERSION = version;
