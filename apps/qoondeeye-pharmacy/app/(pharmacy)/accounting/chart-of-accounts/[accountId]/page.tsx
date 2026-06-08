import AccountFormClient from "../account-form-client";

type PageProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { accountId } = await params;
  return <AccountFormClient mode="edit" accountId={accountId} />;
}
