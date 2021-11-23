class SQSError extends Error {
  public constructor(
    message: string, 
    public readonly awsError: Error, 
    public readonly httpStatusCode: number, 
    public readonly code: string) {
    super(message);
  }
}

class TimeoutError extends Error {
  public constructor(message = 'Operation timed out.') {
    super(message);
    this.message = message;
    this.name = 'TimeoutError';
  }
}

export {
  SQSError,
  TimeoutError
};
