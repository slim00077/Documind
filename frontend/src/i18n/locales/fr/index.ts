import common from "./common";
import documents from "./documents";
import publicPages from "./public";
import assistant from "./assistant";
import settings from "./settings";
import library from "./library";
import workspace from "./workspace";
import admin from "./admin";
import org from "./org";
import server from "./server";

/**
 * French UI dictionary, keyed by the English source string. Split by area to keep files
 * reviewable; `npm run i18n:check` reports duplicate keys across these files.
 */
const fr = {
  ...common,
  ...documents,
  ...publicPages,
  ...assistant,
  ...settings,
  ...library,
  ...workspace,
  ...admin,
  ...org,
  ...server,
};

export default fr;
