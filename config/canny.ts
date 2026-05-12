export const CANNY_DONE_STATUS = "complete";
export const CANNY_NOTIFY_VOTERS = false;
export const CANNY_CHANGER_ID = "68f8da201f833c417ceb2c21"; // Ideas Slack Bot (edwin.lara@futurefit.ai)

export function buildCloseMessage(_jiraKey: string): string {
  return "This idea has been shipped. Thanks for the feedback.";
}
