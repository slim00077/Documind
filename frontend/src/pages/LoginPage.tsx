import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/auth.api";
import AuthShell from "../components/layout/AuthShell";
import { homePath } from "../config/roles";

const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const fromPath =
    (location.state as { from?: { pathname?: string } })
      ?.from?.pathname;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const validate = (): string | null => {
    if (!emailRegex.test(email.trim())) {
      return t("Please enter a valid email address.");
    }

    if (!password) {
      return t("Please enter your password.");
    }

    return null;
  };

  const onSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const signedIn = await login({
        email: email.trim(),
        password,
      });
      navigate(fromPath ?? homePath(signedIn.role), { replace: true });
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError(t("Unable to sign in right now. Please try again."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">{t("Welcome back")}</h1>
        <p className="auth-hint">
          {t("Sign in to continue managing your AI-powered documents.")}
        </p>

        <label className="auth-label" htmlFor="email">
          {t("Email")}
        </label>
        <input
          id="email"
          className="auth-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          disabled={isSubmitting}
          required
        />

        <label className="auth-label" htmlFor="password">
          {t("Password")}
        </label>
        <div className="password-input-row">
          <input
            id="password"
            className="auth-input"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            disabled={isSubmitting}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowPassword(
                (previous) => !previous
              )
            }
            disabled={isSubmitting}
            aria-label={
              showPassword
                ? t("Hide password")
                : t("Show password")
            }
          >
            {showPassword ? t("Hide") : t("Show")}
          </button>
        </div>

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="auth-submit"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? t("Signing in...") : t("Sign in")}
        </button>

        <p className="auth-footer">
          {t("New to DocuMind?")}{" "}
          <Link to="/register">{t("Create an account")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
