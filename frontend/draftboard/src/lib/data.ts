import * as axios from "axios";
import type { AxiosResponse, AxiosRequestConfig  } from "axios";
import type { DraftRetrieveOutput,
    DraftListRetrieveOutput,
    DraftRetrieveParams,
    DraftManagersOutput,
    DraftSlotsRetrieveOutput,
    DraftSubmitPickOutput,
    DraftSubmitPickParams,
    AvailablePlayersRetrieveOutput,
    DraftBudgetPickParams,
    DraftCreateParams,
    DraftPlanOutput,
    TargetTierOutput,
    CurrentUserOutput,
    MockDraftSummary,
    MockDraftDetail,
    MockDraftPlayer
} from "./draft.schemas";

// DRF's SessionAuthentication enforces CSRF only on authenticated requests,
// so every write must carry the token now that the app requires login.
// Django's csrftoken cookie is the source (it survives login rotations,
// unlike the window.csrfToken snapshot rendered into index.html).
axios.default.defaults.xsrfCookieName = "csrftoken";
axios.default.defaults.xsrfHeaderName = "X-CSRFToken";

// An expired session mid-use answers 403 "credentials were not provided" on
// every call; bounce to login rather than silently showing stale data. Other
// 403s (e.g. a spectator poking a drafter endpoint) pass through untouched.
axios.default.interceptors.response.use(
    (response) => response,
    (error) => {
        const detail = error?.response?.data?.detail;
        if (
            error?.response?.status === 403 &&
            typeof detail === "string" &&
            detail.includes("credentials were not provided")
        ) {
            window.location.assign(
                `/login/?next=${encodeURIComponent(window.location.pathname)}`
            );
        }
        return Promise.reject(error);
    }
);

export const meRetrieve = <
  TData = AxiosResponse<CurrentUserOutput>,
  >(
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/me/`, options)
  }

export const logout = (): Promise<void> => {
    return axios.default.post(`/logout/`).then(() => {
        window.location.assign("/login/");
    })
  }

export const draftListRetrieve = <
  TData = AxiosResponse<DraftListRetrieveOutput>,
  >(
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/drafts`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }


export const draftRetrieve = <
  TData = AxiosResponse<DraftRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/detail`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }


  export const draftManagersRetrieve = <
  TData = AxiosResponse<DraftManagersOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/managers/detail`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }

  export const draftPicksRetrieve = <
  TData = AxiosResponse<DraftRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/picks`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }

  export const draftAvailablePlayersRetrieve = <
  TData = AxiosResponse<AvailablePlayersRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/available_players`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }

  export const draftSlotsRetrieve = <
  TData = AxiosResponse<DraftSlotsRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/draft_board/detail`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }

  export const draftManagerPicksRetrieve = <
  TData = AxiosResponse<DraftSlotsRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/manager_picks`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }


  export const draftBudgetedPicksRetrieve = <
  TData = AxiosResponse<DraftSlotsRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/budgeted_picks`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }
  export const draftWatchedPicksRetrieve = <
  TData = AxiosResponse<DraftSlotsRetrieveOutput>,
  >(
    draft_id: string,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.get(`/api/drafts/draft/${draft_id}/watched_picks`, {
        ...options,
    })
  }



  export const draftPickSubmit = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    player_id: number,
    params: DraftSubmitPickParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/submit_pick/${manager_id}/${player_id}/`, {
        params,
        options,
    })
  }

  export const draftPickUnsubmit = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    player_id: number,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    const unsubmitUrl = `/api/drafts/draft/${draft_id}/unsubmit_pick/${manager_id}/${player_id}/`;
    return axios.default.post(unsubmitUrl, {
        options,
    })
  }

  export const draftBudgetPick = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    player_id: number,
    params: DraftBudgetPickParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/budget_pick/${manager_id}/${player_id}/`, {
        params,
        options,
    })
  }

  export const draftUnbudgetPick = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    player_id: number,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/unbudget_pick/${manager_id}/${player_id}/`, {
        options,
    })
  }

  type ReslotParams = {
    assignments: Record<string, number>
  }

  export const draftReslotPicks = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    params: ReslotParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/reslot_picks/${manager_id}/`, {
        params,
        options,
    })
  }

  export const draftReslotBudget = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    params: ReslotParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/reslot_budget/${manager_id}/`, {
        params,
        options,
    })
  }

  type WatchParams = {
    watch: boolean
  }

  export const draftWatchPick = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    draft_id: number,
    manager_id: number,
    player_id: number,
    params: WatchParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/${draft_id}/watch/${manager_id}/${player_id}/`, {
        options,
        params,
    })
  }

  export const draftCreate = <
  TData = AxiosResponse<DraftSubmitPickOutput>,
  >(
    params: DraftCreateParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    return axios.default.post(`/api/drafts/draft/create/`, {
        params,
        options,
    })
  }

    export const draftDelete = <
    TData = AxiosResponse<DraftSubmitPickOutput>,
    >(
      draft_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/delete/${draft_id}/`, {
          options,
      })
    }

    // The server cycles the tri-state itself (null -> true -> false -> null),
    // so the request carries no target value; the response has the new state.
    export const favoritePlayer = <
    TData = AxiosResponse<DraftSubmitPickOutput>,
    >(
      draft_id: number,
      player_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/${draft_id}/favorite_player/${player_id}/`, {
          options,
      })
    }

    // Undrafted players grouped by Player.target_tier (set in /admin), best
    // tier first. Read straight from the server — tiers are reference data the
    // board never writes, so they stay out of the Dexie pipeline.
    export const draftTargetTiersRetrieve = <
    TData = AxiosResponse<TargetTierOutput[]>,
    >(
      draft_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.get(`/api/drafts/draft/${draft_id}/target_tiers/`, {
          ...options,
      })
    }

    export const draftPlansRetrieve = <
    TData = AxiosResponse<DraftPlanOutput[]>,
    >(
      params?: { year?: number },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.get(`/api/drafts/draft/plans/`, {
          ...options,
          params: { ...params, ...options?.params },
      })
    }

    export const draftPlanCreate = <
    TData = AxiosResponse<DraftPlanOutput>,
    >(
      draft_id: number,
      params: { name: string },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/${draft_id}/create_plan/`, {
          options,
          params,
      })
    }

    export const draftPlanDelete = <
    TData = AxiosResponse<void>,
    >(
      plan_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/plans/${plan_id}/delete/`, {
          options,
      })
    }

    // ---- Mock drafts ------------------------------------------------------
    // A single roster of slots with no managers, built to be saved as a plan.
    // These read/write the server DIRECTLY (React Query) rather than through
    // Dexie — prep-time work, so the offline write queue has no part in it.
    // Every write answers with the full mock detail, so callers can seed the
    // cache from the response instead of refetching.

    export const mockDraftsRetrieve = <
    TData = AxiosResponse<MockDraftSummary[]>,
    >(
      params?: { year?: number },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.get(`/api/drafts/draft/mocks/`, {
          ...options,
          params: { ...params, ...options?.params },
      })
    }

    export const mockDraftRetrieve = <
    TData = AxiosResponse<MockDraftDetail>,
    >(
      mock_draft_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.get(`/api/drafts/draft/mocks/${mock_draft_id}/`, {
          ...options,
      })
    }

    export const mockDraftCreate = <
    TData = AxiosResponse<MockDraftDetail>,
    >(
      params: { name: string, starting_budget?: number, year?: number },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/mocks/create/`, {
          options,
          params,
      })
    }

    export const mockDraftDelete = <
    TData = AxiosResponse<void>,
    >(
      mock_draft_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/mocks/${mock_draft_id}/delete/`, {
          options,
      })
    }

    export const mockDraftAvailablePlayersRetrieve = <
    TData = AxiosResponse<MockDraftPlayer[]>,
    >(
      mock_draft_id: number,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.get(`/api/drafts/draft/mocks/${mock_draft_id}/available_players/`, {
          ...options,
      })
    }

    // Places OR moves the player: they leave whatever slot they were in, and
    // whoever held the target slot is dropped from the mock (server-side).
    export const mockDraftSetPick = <
    TData = AxiosResponse<MockDraftDetail>,
    >(
      mock_draft_id: number,
      player_id: number,
      params: { position_slot: string, price: number },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/mocks/${mock_draft_id}/pick/${player_id}/`, {
          options,
          params,
      })
    }

    export const mockDraftClearSlot = <
    TData = AxiosResponse<MockDraftDetail>,
    >(
      mock_draft_id: number,
      params: { position_slot: string },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/mocks/${mock_draft_id}/clear_slot/`, {
          options,
          params,
      })
    }

    export const mockDraftCreatePlan = <
    TData = AxiosResponse<DraftPlanOutput>,
    >(
      mock_draft_id: number,
      params: { name: string },
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/mocks/${mock_draft_id}/create_plan/`, {
          options,
          params,
      })
    }
