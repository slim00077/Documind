import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loginRequest,
  meRequest,
  registerRequest,
  type AuthUser,
} from "../services/auth.api";

const AUTH_TOKEN_KEY = "documind_auth_token";

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (payload: LoginInput) => Promise<void>;
  register: (payload: RegisterInput) => Promise<void>;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined);

const getInitialToken = (): string | null =>
  localStorage.getItem(AUTH_TOKEN_KEY);

export const AuthProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [token, setToken] = useState<string | null>(
    getInitialToken
  );
  const [user, setUser] = useState<AuthUser | null>(
    null
  );
  const [isBootstrapping, setIsBootstrapping] =
    useState(true);

  useEffect(() => {
    const hydrateAuth = async () => {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const { user: currentUser } = await meRequest(
          token
        );
        setUser(currentUser);
      } catch (_error) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void hydrateAuth();
  }, [token]);

  const login = async (payload: LoginInput) => {
    const loginResult = await loginRequest(payload);

    localStorage.setItem(
      AUTH_TOKEN_KEY,
      loginResult.token
    );
    setToken(loginResult.token);

    const { user: currentUser } = await meRequest(
      loginResult.token
    );
    setUser(currentUser);
  };

  const register = async (
    payload: RegisterInput
  ) => {
    const registerResult = await registerRequest(
      payload
    );

    localStorage.setItem(
      AUTH_TOKEN_KEY,
      registerResult.token
    );
    setToken(registerResult.token);
    setUser(registerResult.user);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const updateUser = (nextUser: AuthUser) => {
    setUser(nextUser);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      login,
      register,
      logout,
      updateUser,
    }),
    [isBootstrapping, token, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
};
