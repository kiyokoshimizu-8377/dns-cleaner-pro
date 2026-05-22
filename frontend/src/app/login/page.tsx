"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Lock, ArrowRight } from "lucide-react";
import { loadUsers, saveUsers } from "@/lib/user-manager";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const toggleMode = (toRegister: boolean) => {
    setError("");
    setSuccess("");
    setIsRegister(toRegister);
  };

  React.useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim()) {
      setError("Username or Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const users = loadUsers();
      const input = username.trim().toLowerCase();

      const matchedUser = users.find(
        (u) =>
          u.username.toLowerCase() === input ||
          u.email.toLowerCase() === input,
      );

      if (!matchedUser || matchedUser.password !== password) {
        setError("Invalid username or password!");
        setIsLoading(false);
        return;
      }

      if (matchedUser.status === "inactive") {
        setError("Ce compte est désactivé. Contactez un administrateur.");
        setIsLoading(false);
        return;
      }

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("currentUser", JSON.stringify(matchedUser));
      setSuccess(`Welcome back, ${matchedUser.username}!`);
      
      setTimeout(() => {
        router.push("/");
      }, 1000);
    }, 1200);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Invalid email format");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    if (password.length < 5) {
      setError("Password must be at least 5 characters");
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const users = loadUsers();

      const usernameExists = users.some(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
      );
      if (usernameExists) {
        setError("Username already exists!");
        setIsLoading(false);
        return;
      }

      const emailExists = users.some(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (emailExists) {
        setError("Email already registered!");
        setIsLoading(false);
        return;
      }

      const newUser = {
        id: `u-${Date.now()}`,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: "user" as const,
        status: "active" as const,
      };

      saveUsers([...users, newUser]);
      
      setSuccess("Account created successfully!");
      setIsLoading(false);
      
      setUsername("");
      setEmail("");
      setPassword("");

      setTimeout(() => {
        setIsRegister(false);
        setSuccess("");
      }, 1500);
    }, 1200);
  };

  return (
    <div className="h-screen w-screen overflow-hidden fixed inset-0 flex items-center justify-center bg-background text-foreground transition-colors duration-500 p-6 font-sans">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-4xl h-[560px] bg-card dark:bg-[#141824] rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:shadow-[0_30px_100px_rgba(0,0,0,0.9),_0_0_50px_rgba(99,102,241,0.15)] border border-border dark:border-white/10 transition-all duration-500">

        {/* Slanting Background Panel */}
        <div
          className={cn(
            "absolute top-0 w-[60%] h-full z-10 transition-all duration-700 ease-in-out bg-gradient-to-br from-primary to-indigo-900 shadow-2xl",
            isRegister ? "left-0" : "left-[40%]"
          )}
          style={{
            clipPath: isRegister
              ? "polygon(0 0, 100% 0, 75% 100%, 0% 100%)"
              : "polygon(25% 0, 100% 0, 100% 100%, 0% 100%)"
          }}
        />

        {/* Branding (Top Left) */}
        <div className="absolute top-8 left-8 z-30 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30">
            <ShieldCheck className="text-primary w-6 h-6" />
          </div>
          <span className="text-xl font-black text-foreground tracking-tighter transition-colors duration-500">CloudDNS</span>
        </div>

        {/* --- Panels --- */}

        {/* LOGIN FORM */}
        <div className={cn(
          "absolute left-0 top-0 w-[45%] h-full flex flex-col justify-center px-12 z-20",
          isRegister ? "pointer-events-none" : "pointer-events-auto"
        )}>
          <div className="space-y-6">
            <h1 className={cn(
              "text-5xl font-black text-foreground tracking-tight transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-[-120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
            )}
            style={{ transitionDelay: !isRegister ? "0.0s" : "0s" }}>
              Login
            </h1>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-4">
                <div className={cn(
                  "space-y-1 transition-all duration-700 ease-in-out",
                  isRegister ? "translate-x-[-120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
                )}
                style={{ transitionDelay: !isRegister ? "0.1s" : "0s" }}>
                  <div className="relative border-b border-border focus-within:border-primary transition-colors group">
                    <input
                      type="text"
                      placeholder=" "
                      className="peer w-full bg-transparent pt-6 pb-2 pr-10 transition-all text-sm outline-none text-foreground placeholder-transparent"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <label className="absolute left-0 top-6 text-sm text-muted-foreground/60 transition-all duration-300 pointer-events-none origin-left peer-focus:top-1 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs">
                      Username
                    </label>
                    <UserIcon className="absolute right-0 bottom-3 w-4 h-4 text-muted-foreground/30 peer-focus:text-primary transition-colors" />
                  </div>
                </div>

                <div className={cn(
                  "space-y-1 transition-all duration-700 ease-in-out",
                  isRegister ? "translate-x-[-120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
                )}
                style={{ transitionDelay: !isRegister ? "0.2s" : "0s" }}>
                  <div className="relative border-b border-border focus-within:border-primary transition-colors group">
                    <input
                      type="password"
                      placeholder=" "
                      className="peer w-full bg-transparent pt-6 pb-2 pr-10 transition-all text-sm outline-none text-foreground placeholder-transparent"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <label className="absolute left-0 top-6 text-sm text-muted-foreground/60 transition-all duration-300 pointer-events-none origin-left peer-focus:top-1 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs">
                      Password
                    </label>
                    <Lock className="absolute right-0 bottom-3 w-4 h-4 text-muted-foreground/30 peer-focus:text-primary transition-colors" />
                  </div>
                </div>
              </div>

              {/* Inline Feedback Message */}
              {(error || success) && !isRegister && (
                <div className={cn(
                  "flex items-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 mt-4",
                  error 
                    ? "bg-red-500/10 border-red-500/20 text-red-500" 
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                )}>
                  {error ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  )}
                  <span>{error || success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full py-4 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-full font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-700 ease-in-out flex items-center justify-center gap-3 mt-4",
                  isRegister ? "translate-x-[-120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
                )}
                style={{ transitionDelay: !isRegister ? "0.3s" : "0s" }}
              >
                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>Login <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <p className={cn(
              "text-center text-xs text-muted-foreground/60 font-medium transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-[-120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
            )}
            style={{ transitionDelay: !isRegister ? "0.4s" : "0s" }}>
              Don&apos;t have an account?{" "}
              <button type="button" onClick={() => toggleMode(true)} className="text-primary font-bold hover:underline">Sign Up</button>
            </p>
          </div>
        </div>

        {/* REGISTER FORM */}
        <div className={cn(
          "absolute right-0 top-0 w-[45%] h-full flex flex-col justify-center px-12 z-20",
          isRegister ? "pointer-events-auto" : "pointer-events-none"
        )}>
          <div className="space-y-6">
            <h1 className={cn(
              "text-5xl font-black text-foreground tracking-tight transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
            )}
            style={{ transitionDelay: isRegister ? "0.0s" : "0s" }}>
              Sign Up
            </h1>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-4">
                <div className={cn(
                  "space-y-1 transition-all duration-700 ease-in-out",
                  isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
                )}
                style={{ transitionDelay: isRegister ? "0.1s" : "0s" }}>
                  <div className="relative border-b border-border focus-within:border-primary transition-colors group">
                    <input
                      type="text"
                      placeholder=" "
                      className="peer w-full bg-transparent pt-6 pb-2 pr-10 transition-all text-sm outline-none text-foreground placeholder-transparent"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <label className="absolute left-0 top-6 text-sm text-muted-foreground/60 transition-all duration-300 pointer-events-none origin-left peer-focus:top-1 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs">
                      Username
                    </label>
                    <UserIcon className="absolute right-0 bottom-3 w-4 h-4 text-muted-foreground/30 peer-focus:text-primary transition-colors" />
                  </div>
                </div>

                <div className={cn(
                  "space-y-1 transition-all duration-700 ease-in-out",
                  isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
                )}
                style={{ transitionDelay: isRegister ? "0.2s" : "0s" }}>
                  <div className="relative border-b border-border focus-within:border-primary transition-colors group">
                    <input
                      type="email"
                      placeholder=" "
                      className="peer w-full bg-transparent pt-6 pb-2 pr-10 transition-all text-sm outline-none text-foreground placeholder-transparent"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <label className="absolute left-0 top-6 text-sm text-muted-foreground/60 transition-all duration-300 pointer-events-none origin-left peer-focus:top-1 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs">
                      Work Email
                    </label>
                    <Mail className="absolute right-0 bottom-3 w-4 h-4 text-muted-foreground/30 peer-focus:text-primary transition-colors" />
                  </div>
                </div>

                <div className={cn(
                  "space-y-1 transition-all duration-700 ease-in-out",
                  isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
                )}
                style={{ transitionDelay: isRegister ? "0.3s" : "0s" }}>
                  <div className="relative border-b border-border focus-within:border-primary transition-colors group">
                    <input
                      type="password"
                      placeholder=" "
                      className="peer w-full bg-transparent pt-6 pb-2 pr-10 transition-all text-sm outline-none text-foreground placeholder-transparent"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <label className="absolute left-0 top-6 text-sm text-muted-foreground/60 transition-all duration-300 pointer-events-none origin-left peer-focus:top-1 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs">
                      Password
                    </label>
                    <Lock className="absolute right-0 bottom-3 w-4 h-4 text-muted-foreground/30 peer-focus:text-primary transition-colors" />
                  </div>
                </div>
              </div>

              {/* Inline Feedback Message */}
              {(error || success) && isRegister && (
                <div className={cn(
                  "flex items-center gap-2 text-xs font-semibold py-2.5 px-4 rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 mt-4",
                  error 
                    ? "bg-red-500/10 border-red-500/20 text-red-500" 
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                )}>
                  {error ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  )}
                  <span>{error || success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  "w-full py-4 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-full font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-700 ease-in-out flex items-center justify-center gap-3 mt-4",
                  isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
                )}
                style={{ transitionDelay: isRegister ? "0.4s" : "0s" }}
              >
                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>Sign Up <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <p className={cn(
              "text-center text-xs text-muted-foreground/60 font-medium transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[120%] opacity-0 blur-lg"
            )}
            style={{ transitionDelay: isRegister ? "0.5s" : "0s" }}>
              Already have an account?{" "}
              <button type="button" onClick={() => toggleMode(false)} className="text-primary font-bold hover:underline">Sign In</button>
            </p>
          </div>
        </div>

        {/* --- Welcome Texts --- */}

        {/* WELCOME BACK (Right side when !isRegister) */}
        <div className={cn(
          "absolute right-0 top-0 w-[55%] h-full flex flex-col items-center justify-center px-20 text-center z-20",
          isRegister ? "pointer-events-none" : "pointer-events-auto"
        )}>
          <div className="space-y-6 text-white">
            <h2 className={cn(
              "text-5xl font-black leading-tight uppercase tracking-tighter transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-[120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
            )}
            style={{ transitionDelay: !isRegister ? "0.1s" : "0s" }}>
              Welcome <br /> Back!
            </h2>
            <p className={cn(
              "text-sm font-medium leading-relaxed opacity-70 max-w-[320px] transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-[120%] opacity-0 blur-lg" : "translate-x-0 opacity-100 blur-0"
            )}
            style={{ transitionDelay: !isRegister ? "0.2s" : "0s" }}>
              We are happy to have you with us again. If you need anything, we are here to help.
            </p>
          </div>
        </div>

        {/* WELCOME (Left side when isRegister) */}
        <div className={cn(
          "absolute left-0 top-0 w-[55%] h-full flex flex-col items-center justify-center px-20 text-center z-20",
          isRegister ? "pointer-events-auto" : "pointer-events-none"
        )}>
          <div className="space-y-6 text-white">
            <h2 className={cn(
              "text-5xl font-black leading-tight uppercase tracking-tighter transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[-120%] opacity-0 blur-lg"
            )}
            style={{ transitionDelay: isRegister ? "0.1s" : "0s" }}>
              Welcome!
            </h2>
            <p className={cn(
              "text-sm font-medium leading-relaxed opacity-70 max-w-[320px] transition-all duration-700 ease-in-out",
              isRegister ? "translate-x-0 opacity-100 blur-0" : "translate-x-[-120%] opacity-0 blur-lg"
            )}
            style={{ transitionDelay: isRegister ? "0.2s" : "0s" }}>
              We&apos;re delighted to have you here. Register to get full access to manage your DNS infrastructure.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

function UserIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  );
}

// Helper for spinner
function RefreshCw(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
  );
}

// Helper for Alert
function AlertCircle(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
  );
}
