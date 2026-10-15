// The build this page is (item 5's seventh step, 2026-10-14, docs/02): "dev" here, and the commit when the deploy
// workflow stamps the site's copy (.github/workflows/deploy.yml, the Pages job). The server stamps its own the same way
// (Dockerfile, CMZ_BUILD_ID); a server world refuses a join from a page of another build with "The game was updated",
// since GitHub Pages and Fly finish deploying minutes apart and Pages caches the modules, and a change to the game's
// logic seldom moves net.PROTOCOL. Either side "dev": no comparison (local tests, and the site until it is stamped).
export const BUILD_ID = "dev";
