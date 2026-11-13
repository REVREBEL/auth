import createKindeClient, {
  type KindeClient,
  type LogoutOptions,
  type RedirectOptions,
} from "@kinde-oss/kinde-auth-pkce-js";

export type REVREBELAuthConfig = {
  clientId: string;
  domain: string;
  redirectUri?: string;
  logoutUri?: string;
  audience?: string;
  scope?: string;
};

type PortalOptions = Parameters<KindeClient["portal"]>[0];

type AuthEventDetail =
  | { type: "redirect"; user: unknown; appState?: Record<string, unknown> }
  | { type: "session-restored"; user: unknown; appState?: Record<string, unknown> }
  | { type: "error"; error: unknown };

type REVREBELAuthApi = {
  configure(config: REVREBELAuthConfig): REVREBELAuthApi;
  ready(): Promise<KindeClient>;
  login(options?: RedirectOptions): Promise<void>;
  register(options?: RedirectOptions): Promise<void>;
  logout(options?: string | LogoutOptions): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getUser(): Promise<ReturnType<KindeClient["getUser"]>>;
  getUserProfile(): ReturnType<KindeClient["getUserProfile"]>;
  getAccessToken(): Promise<string | undefined>;
  portal(options: PortalOptions): Promise<void>;
  createOrganization(options?: RedirectOptions): Promise<void>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

declare global {
  interface Window {
    REVREBELAuth: REVREBELAuthApi;
    REVREBEL_AUTH_CONFIG?: REVREBELAuthConfig;
  }
}

let activeConfig:
  | (Required<Pick<REVREBELAuthConfig, "clientId" | "domain" | "redirectUri">> &
      Omit<REVREBELAuthConfig, "clientId" | "domain" | "redirectUri">)
  | null = null;

let clientPromise: Promise<KindeClient> | null = null;

function normalizeConfig(config: REVREBELAuthConfig) {
  const clientId = config.clientId?.trim();
  const domain = config.domain?.trim().replace(/\/+$/, "");
  const redirectUri =
    config.redirectUri?.trim() ||
    `${window.location.origin}${window.location.pathname}`;

  if (!clientId) {
    throw new Error("REVREBELAuth requires a Kinde clientId.");
  }

  if (!domain) {
    throw new Error("REVREBELAuth requires a Kinde domain.");
  }

  return {
    ...config,
    clientId,
    domain,
    redirectUri,
  };
}

function dispatch(detail: AuthEventDetail) {
  window.dispatchEvent(
    new CustomEvent<AuthEventDetail>("revrebel:auth", {
      detail,
    }),
  );
}

function configure(config: REVREBELAuthConfig) {
  activeConfig = normalizeConfig(config);
  clientPromise = null;
  return api;
}

function requireConfig() {
  if (!activeConfig && window.REVREBEL_AUTH_CONFIG) {
    configure(window.REVREBEL_AUTH_CONFIG);
  }

  if (!activeConfig) {
    throw new Error(
      "REVREBELAuth is not configured. Set window.REVREBEL_AUTH_CONFIG before loading the bundle or call REVREBELAuth.configure(...).",
    );
  }

  return activeConfig;
}

async function getClient() {
  if (clientPromise) {
    return clientPromise;
  }

  const config = requireConfig();

  clientPromise = createKindeClient({
    client_id: config.clientId,
    domain: config.domain,
    redirect_uri: config.redirectUri,
    ...(config.logoutUri ? { logout_uri: config.logoutUri } : {}),
    ...(config.audience ? { audience: config.audience } : {}),
    ...(config.scope ? { scope: config.scope } : {}),
    on_redirect_callback: (user, appState) => {
      dispatch({ type: "redirect", user, appState });
    },
    on_session_restore_callback: (user, appState) => {
      dispatch({ type: "session-restored", user, appState });
    },
    on_error_callback: (error) => {
      dispatch({ type: "error", error });
    },
  });

  try {
    return await clientPromise;
  } catch (error) {
    clientPromise = null;
    dispatch({ type: "error", error });
    throw error;
  }
}

const api: REVREBELAuthApi = {
  configure,

  ready() {
    return getClient();
  },

  async login(options) {
    await (await getClient()).login(options);
  },

  async register(options) {
    await (await getClient()).register(options);
  },

  async logout(options) {
    await (await getClient()).logout(options);
  },

  async isAuthenticated() {
    return (await getClient()).isAuthenticated();
  },

  async getUser() {
    return (await getClient()).getUser();
  },

  async getUserProfile() {
    return (await getClient()).getUserProfile();
  },

  async getAccessToken() {
    return (await getClient()).getAccessToken();
  },

  async portal(options) {
    await (await getClient()).portal(options);
  },

  async createOrganization(options) {
    await (await getClient()).createOrg(options);
  },

  async fetch(input, init = {}) {
    const token = await api.getAccessToken();
    const headers = new Headers(init.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return window.fetch(input, {
      ...init,
      headers,
    });
  },
};

window.REVREBELAuth = api;

if (window.REVREBEL_AUTH_CONFIG) {
  configure(window.REVREBEL_AUTH_CONFIG);
  void getClient().catch(() => {
    // Error details are emitted through the revrebel:auth event.
  });
}
