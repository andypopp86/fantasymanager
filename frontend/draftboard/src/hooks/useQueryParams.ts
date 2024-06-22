import { useLocation } from "react-router-dom";
import * as qs from "qs";

export const useQueryParams = () => {
    const location = useLocation();
    return qs.parse(location.search, { ignoreQueryPrefix: true })
}