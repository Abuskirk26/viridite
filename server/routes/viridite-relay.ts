/**
 * Same relay as the middleware. Kept so a direct route match still answers
 * if the page handler is reached first.
 */
import { defineHandler } from "h3";
import { relayHttp } from "../relay-http.ts";

export default defineHandler((event) => relayHttp(event.req));
