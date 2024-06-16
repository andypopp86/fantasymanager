import { useLocation } from "@reach/router";
import * as qs from "qs";

export const useQueryParams = () => {
    const location = useLocation();
    return qs.parse(location.search, { ignoreQueryPrefix: true })
}