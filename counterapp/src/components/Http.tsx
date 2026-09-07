import { http } from '../preview-api';
import { useEffect } from 'react';

export const HttpRequest = () => {
  useEffect(() => {
    http.get<{
      code: number;
      message: string;
    }>('https://www.baidu.com').then((response) => {
      console.error('123', response);
    });
  }, []);
};
