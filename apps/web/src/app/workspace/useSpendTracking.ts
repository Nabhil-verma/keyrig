import { useCallback, useEffect, useMemo, useState } from "react";
import { createUsageBus, type UsageEvent } from "@keyrig/core";
import type { StorageLike } from "@keyrig/shared";
import { recordActivity } from "../../lib/streak";
import {
  addSpend,
  readSpend,
  readSpendHistory,
  readSpendKnown,
  utcDay,
  type SpendDay,
} from "../../stores/spendStore";

/** CO-02 and CO-04: the spend of the day, the recent days and this session. */
export function useSpendTracking(storage: StorageLike) {
  const bus = useMemo(() => createUsageBus(), []);
  const [totalCost, setTotalCost] = useState(0);
  const [sessionPricingKnown, setSessionPricingKnown] = useState(true);
  const [spentToday, setSpentToday] = useState(0);
  const [todayPricingKnown, setTodayPricingKnown] = useState(() => readSpendKnown(storage));
  const [spendDays, setSpendDays] = useState<SpendDay[]>(() => readSpendHistory(storage));
  const [usage, setUsage] = useState<UsageEvent[]>([]);

  useEffect(() => {
    setSpentToday(readSpend(storage, utcDay()));
    setTodayPricingKnown(readSpendKnown(storage));
    setSpendDays(readSpendHistory(storage));

    return bus.subscribe((event) => {
      setTotalCost((value) => value + event.costUsd);
      setSessionPricingKnown((value) => value && event.pricingKnown);
      setTodayPricingKnown((value) => value && event.pricingKnown);
      recordActivity(storage);
      setSpentToday(addSpend(storage, event.costUsd, utcDay(), event.pricingKnown));
      setSpendDays(readSpendHistory(storage));
      setUsage((current) => [...current, event].slice(-20));
    });
  }, [bus, storage]);

  /** A new account starts with no session cost, but keeps the budget of the day. */
  const beginSession = useCallback((): void => {
    setTotalCost(0);
    setSessionPricingKnown(true);
    setSpentToday(readSpend(storage, utcDay()));
    setTodayPricingKnown(readSpendKnown(storage));
  }, [storage]);

  /** Sign-out drops the session cost and the request list. */
  const endSession = useCallback((): void => {
    setTotalCost(0);
    setSessionPricingKnown(true);
    setTodayPricingKnown(readSpendKnown(storage));
    setSpendDays(readSpendHistory(storage));
    setUsage([]);
  }, [storage]);

  return {
    bus,
    totalCost,
    sessionPricingKnown,
    spentToday,
    todayPricingKnown,
    spendDays,
    usage,
    beginSession,
    endSession,
  };
}
