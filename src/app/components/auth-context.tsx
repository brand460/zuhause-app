import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, apiFetch } from "./supabase-client";
import type { Session, User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  display_name: string;
}

interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  household: Household | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  createHousehold: (name: string) => Promise<{ id: string }>;
  joinHousehold: (inviteCode: string) => Promise<void>;
  joinByToken: (token: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile and household directly from Supabase tables
  async function loadProfile(userId: string) {
    try {
      // Fetch profile from profiles table
      const { data: p, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.log("Error loading profile:", profileError.message);
        return;
      }

      if (!p) {
        setProfile(null);
        setHousehold(null);
        return;
      }

      setProfile(p);

      // Look up household via household_members table
      const { data: membership, error: memberError } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (memberError) {
        console.log("Error loading membership:", memberError.message);
        setHousehold(null);
        return;
      }

      if (membership?.household_id) {
        const { data: h, error: householdError } = await supabase
          .from("households")
          .select("*")
          .eq("id", membership.household_id)
          .maybeSingle();

        if (householdError) {
          console.log("Error loading household:", householdError.message);
        }
        setHousehold(h || null);
      } else {
        setHousehold(null);
      }
    } catch (err) {
      console.log("Error in loadProfile:", err);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadProfile(s.user.id);
      } else {
        setProfile(null);
        setHousehold(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw new Error(error.message);
  };

  const signUp = async (name: string, email: string, password: string) => {
    // 1. Create user via server (admin API, auto-confirms email)
    await apiFetch("/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });

    // 2. Sign in to get an authenticated session
    await signIn(email, password);

    // 3. Get the authenticated user
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Benutzer konnte nicht geladen werden.");

    // 4. Insert profile directly into profiles table using the Supabase client
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: authUser.id, display_name: name });

    if (profileError) {
      console.log("Profile insert error:", profileError.message);
      throw new Error(`Profil konnte nicht erstellt werden: ${profileError.message}`);
    }

    // 5. Reload profile state
    await loadProfile(authUser.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setHousehold(null);
  };

  const createHousehold = async (name: string): Promise<{ id: string }> => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Nicht autorisiert — kein Benutzer gefunden.");

    const householdName = name?.trim() || "Mein Haushalt";

    // Generate ID client-side so we always have it regardless of RLS RETURNING behaviour
    const householdId = crypto.randomUUID();

    console.log("createHousehold: inserting household, id:", householdId, "user:", authUser.id);

    // Step 1 — insert household (Supabase client manages JWT automatically)
    const { error: hhErr } = await supabase
      .from("households")
      .insert({ id: householdId, name: householdName, created_by: authUser.id });

    if (hhErr) {
      console.log("createHousehold: households insert error:", hhErr);
      throw new Error(`Haushalt konnte nicht erstellt werden: ${hhErr.message}`);
    }

    // Step 2 — insert creator as admin member
    const { error: memberErr } = await supabase
      .from("household_members")
      .insert({ household_id: householdId, user_id: authUser.id, role: "admin" });

    if (memberErr) {
      console.log("createHousehold: household_members insert error:", memberErr);
      // Rollback household
      await supabase.from("households").delete().eq("id", householdId);
      throw new Error(`Mitglied konnte nicht hinzugefügt werden: ${memberErr.message}`);
    }

    console.log("createHousehold: success, id:", householdId);

    // Build household object from known data — no SELECT needed, no RLS issue
    const hh: Household = {
      id: householdId,
      name: householdName,
      created_by: authUser.id,
      invite_code: "",
    };

    setHousehold(hh);
    return { id: householdId };
  };

  const joinHousehold = async (inviteCode: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Nicht autorisiert.");

    // 1. Look up household by invite code
    const { data: h, error: lookupError } = await supabase
      .from("households")
      .select("*")
      .eq("invite_code", inviteCode.toUpperCase())
      .maybeSingle();

    if (lookupError) {
      console.log("Household lookup error:", lookupError.message);
      throw new Error(`Fehler beim Suchen des Haushalts: ${lookupError.message}`);
    }
    if (!h) {
      throw new Error("Ungültiger Einladungscode.");
    }

    // 2. Insert into household_members
    const { error: memberError } = await supabase
      .from("household_members")
      .insert({
        household_id: h.id,
        user_id: authUser.id,
        role: "member",
      });

    if (memberError) {
      console.log("Household member insert error:", memberError.message);
      throw new Error(`Beitreten fehlgeschlagen: ${memberError.message}`);
    }

    // Reload state to pick up the new household
    await loadProfile(authUser.id);
  };

  const joinByToken = async (token: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Nicht autorisiert — kein Benutzer gefunden.");

    // 1. Read invite data directly from KV (no server call, no JWT issues)
    const { data: kvRow, error: kvErr } = await supabase
      .from("kv_store_2a26506b")
      .select("value")
      .eq("key", `invite:${token}`)
      .maybeSingle();

    if (kvErr || !kvRow) throw new Error("Ungültiger Einladungslink.");
    const inviteData = kvRow.value as any;

    if (inviteData.used_by) throw new Error("Dieser Link wurde bereits verwendet.");
    if (new Date(inviteData.expires_at) < new Date()) throw new Error("Dieser Einladungslink ist abgelaufen.");

    // 2. Check if already a member
    const { data: existing } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", inviteData.household_id)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!existing) {
      const { error: memberErr } = await supabase
        .from("household_members")
        .insert({ household_id: inviteData.household_id, user_id: authUser.id, role: "member" });

      if (memberErr) throw new Error(`Beitreten fehlgeschlagen: ${memberErr.message}`);
    }

    // 3. Mark token as used
    await supabase
      .from("kv_store_2a26506b")
      .upsert({ key: `invite:${token}`, value: { ...inviteData, used_by: authUser.id } });

    // 4. Reload profile + household state
    await loadProfile(authUser.id);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        household,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        createHousehold,
        joinHousehold,
        joinByToken,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}