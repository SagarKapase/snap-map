/**
 * Features that can be turned off without removing them.
 *
 * A flag here hides every entry point to a feature — its place in the
 * product switcher, its route, its sample card — while the code, the
 * engine and the tests stay in the repository and keep running. Turning
 * one back on is a single environment variable, not a revert.
 *
 * Each flag is written as a bare comparison against `import.meta.env` on
 * purpose: the bundler replaces that with a literal, folds the comparison,
 * and drops the branch — so a feature that is off does not ship its code
 * either. Wrapping the value in a helper would defeat that.
 */

/**
 * The SOAP Migration Workbench (`/soap`) and the bridge host that serves
 * the REST APIs it hosts. Off for now; set `VITE_SOAP_WORKBENCH=on` (in
 * the environment `vite` runs in, so the host is mounted too) to bring it
 * back — exactly that value, lower case.
 *
 * Contract Graph keeps reading a dropped `.wsdl` either way: that is its
 * own import path and does not depend on this page.
 */
export const SOAP_WORKBENCH = import.meta.env.VITE_SOAP_WORKBENCH === "on";
