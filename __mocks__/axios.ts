import { jest } from '@jest/globals';

const axiosMock = {
  create: jest.fn(),
  request: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  head: jest.fn(),
  options: jest.fn(),
  defaults: {},
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
  },
};

axiosMock.create.mockReturnValue(axiosMock);

export default axiosMock;
