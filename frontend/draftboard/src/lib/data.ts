import * as axios from "axios";
import type { AxiosResponse, AxiosRequestConfig  } from "axios";
import type { DraftRetrieveOutput,
    DraftListRetrieveOutput,
    DraftRetrieveParams,
    DraftManagersOutput,
    AvailablePlayersRetrieveOutput,
} from "./draft.schemas";

export const draftListRetrieve = <
  TData = AxiosResponse<DraftListRetrieveOutput>,
  >(
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    console.log("draft list retrieve")
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
    console.log("draft retrieve")
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
    console.log("draft managers retrieve")
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
  TData = AxiosResponse<DraftRetrieveOutput>,
  >(
    draft_id: string,
    params?:DraftRetrieveParams,
    options?: AxiosRequestConfig,
  ): Promise<TData> => {
    console.log("draft slots retrieve")
    return axios.default.get(`/api/drafts/draft/${draft_id}/draft_board/detail`, {
        ...options,
        params: { ...params, ...options?.params }
    })
  }
