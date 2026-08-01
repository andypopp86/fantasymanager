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
    FavoritePlayerParams,
    DraftPlanOutput
} from "./draft.schemas";

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

    export const favoritePlayer = <
    TData = AxiosResponse<DraftSubmitPickOutput>,
    >(
      draft_id: number,
      player_id: number,
      params: FavoritePlayerParams,
      options?: AxiosRequestConfig,
    ): Promise<TData> => {
      return axios.default.post(`/api/drafts/draft/${draft_id}/favorite_player/${player_id}/`, {
          options,
          params,
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
