import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/auth.api";
import { GraduationCap } from "lucide-react";
import AuthShell from "../components/layout/AuthShell";

const emailRegex =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();
  const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const validate = (): string | null => {
    if (!name.trim()) {
      return t("Please enter your name.");
    }

    if (!emailRegex.test(email.trim())) {
      return t("Please enter a valid email address.");
    }

    if (password.length < 8) {
      return t("Password must be at least 8 characters.");
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
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // Coming from an invitation link: go straight back to it. Otherwise offer the two ways to start.
      navigate(fromPath ?? "/onboarding", { replace: true });
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError(t("Unable to create your account right now. Please try again."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">{t("Create your account")}</h1>
        <p className="auth-hint">
          {t("Start organizing and understanding your documents with AI.")}
        </p>
        <p className="role-note">
          <GraduationCap aria-hidden="true" />
          <span>{t("Your account works on its own: you can join a school, university or company any time, but you never have to.")}</span>
        </p>

        <label className="auth-label" htmlFor="name">
          {t("Name")}
        </label>
        <input
          id="name"
          className="auth-input"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          disabled={isSubmitting}
          required
        />

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
            autoComplete="new-password"
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
          {isSubmitting
            ? t("Creating account...")
            : t("Create account")}
        </button>

        <p className="auth-footer">
          {t("Already have an account?")}{" "}
          <Link to="/login">{t("Sign in")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
