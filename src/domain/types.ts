export type Session = { loggedIn: false } | { loggedIn: true; mid: number };

export type PageClass =
  | { kind: "home" }
  | { kind: "login" }
  | { kind: "video"; id: string }
  | { kind: "native"; page: "favorites" | "history" | "watchlater" }
  | {
      kind: "work";
      work: "article" | "collection" | "course" | "space";
      mid: number | null;
      id: string;
    }
  | { kind: "blocked" };

export type Decision =
  | { type: "show-home" }
  | { type: "show-up"; mid: number }
  | { type: "leave-login" }
  | { type: "prompt-login" }
  | { type: "video"; id: string }
  | {
      type: "native-stripped";
      page: "favorites" | "history" | "watchlater";
    }
  | { type: "work-stripped" }
  | {
      type: "resolve-work";
      work: "article" | "collection" | "course";
      id: string;
    }
  | { type: "redirect-home" };
