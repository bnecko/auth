import { authBaseUrl } from "./config";

export const rpName = "Bottleneck Auth";

export function getRpID() {
  const url = authBaseUrl();
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "localhost";
  }
}

export function getOrigin() {
  return authBaseUrl();
}
