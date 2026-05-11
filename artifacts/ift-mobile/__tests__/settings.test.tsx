import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  getToken: vi.fn(async () => "fake-jwt"),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  routerBack: vi.fn(),
  qcClear: vi.fn(),
  deregisterPushTokenForSignOut: vi.fn(async () => undefined),
  asyncStorage: new Map<string, string>(),
}));

vi.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({
    signOut: mocks.signOut,
    getToken: mocks.getToken,
    isSignedIn: true,
    isLoaded: true,
  }),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mocks.routerReplace,
    push: mocks.routerPush,
    back: mocks.routerBack,
  }),
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Warning: "warning" },
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({ data: { username: "tester", id: "u_1" } }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ clear: mocks.qcClear }) };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.asyncStorage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      mocks.asyncStorage.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      mocks.asyncStorage.delete(k);
    }),
    clear: vi.fn(async () => {
      mocks.asyncStorage.clear();
    }),
  },
}));

vi.mock("@/hooks/use-push-registration", () => ({
  deregisterPushTokenForSignOut: mocks.deregisterPushTokenForSignOut,
}));

vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({ radius: 20 }),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => {
  const Stub = (props: { name?: string }) =>
    React.createElement("span", { "data-icon": props.name ?? "" });
  return { Ionicons: Stub, Feather: Stub };
});

import SettingsScreen from "../app/settings";

describe("SettingsScreen — Reset Session rescue button", () => {
  beforeEach(() => {
    mocks.signOut.mockClear();
    mocks.getToken.mockClear();
    mocks.routerReplace.mockClear();
    mocks.routerPush.mockClear();
    mocks.qcClear.mockClear();
    mocks.deregisterPushTokenForSignOut.mockClear();
    mocks.asyncStorage.clear();
  });

  it("renders the Reset Session row in the Session section", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("settings-reset-session")).toBeInTheDocument();
    expect(screen.getByText("Reset Session")).toBeInTheDocument();
    expect(
      screen.getByText("Force clear sign-in & local data"),
    ).toBeInTheDocument();
  });

  it("clears AsyncStorage, signs out, drops the query cache, and lands on the sign-in screen when the user confirms", async () => {
    const AsyncStorage = (
      await import("@react-native-async-storage/async-storage")
    ).default;
    await AsyncStorage.setItem("orbn:privacy:dm-read-receipts", "off");
    expect(await AsyncStorage.getItem("orbn:privacy:dm-read-receipts")).toBe(
      "off",
    );

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SettingsScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("settings-reset-session"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0]?.[0]).toMatch(/Reset Session/);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/(auth)/sign-in");
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.qcClear).toHaveBeenCalledTimes(1);
    expect(mocks.deregisterPushTokenForSignOut).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("orbn:privacy:dm-read-receipts")).toBeNull();
    expect(mocks.asyncStorage.size).toBe(0);

    confirmSpy.mockRestore();
  });

  it("does NOT reset anything when the user cancels the confirm", async () => {
    const AsyncStorage = (
      await import("@react-native-async-storage/async-storage")
    ).default;
    await AsyncStorage.setItem("orbn:privacy:dm-read-receipts", "off");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<SettingsScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("settings-reset-session"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.qcClear).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem("orbn:privacy:dm-read-receipts")).toBe(
      "off",
    );

    confirmSpy.mockRestore();
  });

  it("still lands on the sign-in screen even if signOut throws", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("clerk session already gone"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SettingsScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("settings-reset-session"));

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/(auth)/sign-in");
    });
    expect(mocks.qcClear).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });
});
