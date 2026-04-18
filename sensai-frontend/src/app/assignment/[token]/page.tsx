import LearnerAssignmentPage from "@/components/LearnerAssignmentPage";

export const metadata = {
    title: "Assignment · SensAI",
    description: "Practice assignment shared by your instructor",
};

export default async function AssignmentPage({ params }: { params: Promise<{ token: string }> }) {
    const resolvedParams = await params;
    return <LearnerAssignmentPage token={resolvedParams.token} />;
}
