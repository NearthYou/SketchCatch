"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import { getProjectDeliveryProfile } from "../api";

export type ProjectDeliveryProfileStatus = "loading" | "idle" | "error";

export type ProjectDeliveryProfileState = {
  readonly projectId: string;
  readonly generation: number;
  readonly profile: ProjectDeliveryProfile | null;
  readonly status: ProjectDeliveryProfileStatus;
  readonly errorMessage: string;
};

export type ProjectDeliveryProfileAction =
  | { readonly type: "start"; readonly projectId: string; readonly generation: number }
  | {
      readonly type: "success";
      readonly projectId: string;
      readonly generation: number;
      readonly profile: ProjectDeliveryProfile;
    }
  | {
      readonly type: "error";
      readonly projectId: string;
      readonly generation: number;
      readonly errorMessage: string;
    };

export function createProjectDeliveryProfileState(
  projectId: string
): ProjectDeliveryProfileState {
  return {
    projectId,
    generation: 0,
    profile: null,
    status: "loading",
    errorMessage: ""
  };
}

export function reduceProjectDeliveryProfileState(
  state: ProjectDeliveryProfileState,
  action: ProjectDeliveryProfileAction
): ProjectDeliveryProfileState {
  if (action.type === "start") {
    return {
      projectId: action.projectId,
      generation: action.generation,
      profile: state.projectId === action.projectId ? state.profile : null,
      status: "loading",
      errorMessage: ""
    };
  }

  if (state.projectId !== action.projectId || state.generation !== action.generation) {
    return state;
  }

  if (action.type === "success") {
    return { ...state, profile: action.profile, status: "idle", errorMessage: "" };
  }

  return { ...state, status: "error", errorMessage: action.errorMessage };
}

export function useProjectDeliveryProfile(
  projectId: string,
  refreshRequestId = 0
): {
  readonly profile: ProjectDeliveryProfile | null;
  readonly status: ProjectDeliveryProfileStatus;
  readonly errorMessage: string;
  readonly refresh: () => Promise<ProjectDeliveryProfile | null>;
} {
  const [state, dispatch] = useReducer(
    reduceProjectDeliveryProfileState,
    projectId,
    createProjectDeliveryProfileState
  );
  const generationRef = useRef(0);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const refresh = useCallback(async (): Promise<ProjectDeliveryProfile | null> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    dispatch({ type: "start", projectId, generation });

    try {
      const profile = await getProjectDeliveryProfile(projectId);
      if (generationRef.current !== generation || projectIdRef.current !== projectId) {
        return null;
      }
      dispatch({ type: "success", projectId, generation, profile });
      return profile;
    } catch (error) {
      if (generationRef.current !== generation || projectIdRef.current !== projectId) {
        return null;
      }
      dispatch({
        type: "error",
        projectId,
        generation,
        errorMessage: getApiErrorMessage(error, "Delivery 정보를 불러오지 못했습니다.")
      });
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshRequestId]);

  return {
    profile: state.projectId === projectId ? state.profile : null,
    status: state.projectId === projectId ? state.status : "loading",
    errorMessage: state.projectId === projectId ? state.errorMessage : "",
    refresh
  };
}
