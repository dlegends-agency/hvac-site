export interface FaqItem {
  question: string;
  answer: string;
}

export const faqs: FaqItem[] = [
  { question: "How does your HVAC repair service work?",
    answer: "You tell us what is wrong with your heating or cooling system, where service is needed and how to reach you. We review the request and help connect you with a suitable independent local contractor when one is available." },
  { question: "Do you perform HVAC repairs directly?",
    answer: "No. We are a referral service. Repairs are performed by independent contractors, not by us." },
  { question: "What information do I need to submit?",
    answer: "Your HVAC issue and how urgent it is, the service address, your name, phone number and email, and your preferred contact method. A description of the problem and property details are optional but helpful." },
  { question: "Will I be connected with a local contractor?",
    answer: "We aim to help, but we can't promise a match. Connections depend on whether a suitable contractor serves your area and can take the work." },
  { question: "How quickly will a contractor contact me?",
    answer: "We can't promise a response time. Timing depends on contractor availability in your area. If your situation is dangerous, contact local emergency services or your utility rather than waiting on a reply." },
  { question: "Is submitting a request free?",
    answer: "Submitting the request form does not ask for payment. Any fees for repairs are agreed directly between you and the contractor, and we can't promise what a contractor will charge." },
  { question: "Which areas do you serve?",
    answer: "Coverage is still being established and varies by location. Enter your address in the request form and we will do our best to help find options near you." },
  { question: "Can I request emergency AC or furnace repair?",
    answer: "Yes. You can select an emergency AC or heating issue and tell us how urgent it is. Marking a request urgent does not guarantee that a contractor is available." },
  { question: "What happens after I submit my information?",
    answer: "We review your request and may share the relevant details with suitable independent contractors so they can respond to you using your preferred contact method." },
];
